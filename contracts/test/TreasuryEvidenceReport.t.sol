// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {DonationTreasury} from "../src/DonationTreasury.sol";
import {EvidenceRegistry} from "../src/EvidenceRegistry.sol";
import {ImpactReportRegistry} from "../src/ImpactReportRegistry.sol";

contract DonationTreasuryTest is Base {
    function setUp() public override {
        super.setUp();
        usdc.faucet(address(treasury), 100e6);
    }

    function test_twoOfThreeFlow() public {
        vm.prank(signer1);
        uint256 id = treasury.submit(address(usdc), stranger, 40e6, keccak256("kit-purchase"));

        vm.prank(signer1);
        vm.expectRevert(DonationTreasury.ThresholdNotMet.selector);
        treasury.execute(id);

        vm.prank(signer2);
        treasury.approve(id);
        vm.prank(signer3);
        treasury.execute(id);

        assertEq(usdc.balanceOf(stranger), 40e6);
        assertTrue(treasury.getProposal(id).executed);
    }

    function test_singleOwnerCannotMoveFunds() public {
        vm.startPrank(signer1);
        uint256 id = treasury.submit(address(usdc), signer1, 100e6, bytes32(0));
        vm.expectRevert(DonationTreasury.ThresholdNotMet.selector);
        treasury.execute(id);
        vm.expectRevert(DonationTreasury.AlreadyApproved.selector);
        treasury.approve(id);
        vm.stopPrank();
    }

    function test_revokeBlocksExecution() public {
        vm.prank(signer1);
        uint256 id = treasury.submit(address(usdc), stranger, 1e6, bytes32(0));
        vm.prank(signer2);
        treasury.approve(id);
        vm.prank(signer2);
        treasury.revoke(id);

        vm.prank(signer1);
        vm.expectRevert(DonationTreasury.ThresholdNotMet.selector);
        treasury.execute(id);
    }

    function test_revert_nonOwnerAndDoubleExecute() public {
        vm.prank(stranger);
        vm.expectRevert(DonationTreasury.NotOwner.selector);
        treasury.submit(address(usdc), stranger, 1e6, bytes32(0));

        vm.prank(signer1);
        uint256 id = treasury.submit(address(usdc), stranger, 1e6, bytes32(0));
        vm.prank(signer2);
        treasury.approve(id);
        vm.prank(signer1);
        treasury.execute(id);

        vm.prank(signer1);
        vm.expectRevert(DonationTreasury.AlreadyExecuted.selector);
        treasury.execute(id);
    }

    function test_revert_overdraw() public {
        vm.prank(signer1);
        uint256 id = treasury.submit(address(usdc), stranger, 101e6, bytes32(0));
        vm.prank(signer2);
        treasury.approve(id);
        vm.prank(signer1);
        vm.expectRevert();
        treasury.execute(id);
    }

    function test_revert_unknownProposal() public {
        vm.prank(signer1);
        vm.expectRevert(DonationTreasury.UnknownProposal.selector);
        treasury.approve(42);
    }

    function test_constructorValidation() public {
        address[] memory dup = new address[](2);
        dup[0] = signer1;
        dup[1] = signer1;
        vm.expectRevert(DonationTreasury.InvalidOwners.selector);
        new DonationTreasury(dup, 1);

        address[] memory ok = new address[](2);
        ok[0] = signer1;
        ok[1] = signer2;
        vm.expectRevert(DonationTreasury.InvalidThreshold.selector);
        new DonationTreasury(ok, 3);
        vm.expectRevert(DonationTreasury.InvalidThreshold.selector);
        new DonationTreasury(ok, 0);

        vm.expectRevert(DonationTreasury.InvalidOwners.selector);
        new DonationTreasury(new address[](0), 1);
    }

    function test_factoryRegistersTreasury() public view {
        assertTrue(factory.isTreasury(address(treasury)));
        assertEq(treasury.owners().length, 3);
        assertEq(treasury.threshold(), 2);
    }
}

contract EvidenceAndReportTest is Base {
    bytes32 internal constant HASH = keccak256("signed-receipt.pdf");

    function _submit(bytes32 h) internal returns (uint256) {
        vm.prank(charity);
        return evidence.submitEvidence(projectId, EvidenceRegistry.Kind.DeliveryReceipt, h, "local://evidence/1");
    }

    function test_submitAndVerify() public {
        vm.expectEmit(true, true, true, true, address(evidence));
        emit EvidenceRegistry.EvidenceSubmitted(
            1, projectId, HASH, charity, EvidenceRegistry.Kind.DeliveryReceipt, "local://evidence/1"
        );
        uint256 id = _submit(HASH);
        assertEq(evidence.evidenceIdByHash(HASH), id);
        assertEq(evidence.submittedCount(projectId), 1);

        vm.prank(verifier);
        evidence.verifyEvidence(id, true, keccak256("looks-good"));

        EvidenceRegistry.Evidence memory e = evidence.getEvidence(id);
        assertEq(uint8(e.status), uint8(EvidenceRegistry.Status.Verified));
        assertEq(e.verifier, verifier);
        assertEq(evidence.verifiedCount(projectId), 1);
    }

    function test_rejectDoesNotCountAsVerified() public {
        uint256 id = _submit(HASH);
        vm.prank(verifier);
        evidence.verifyEvidence(id, false, bytes32(0));
        assertEq(evidence.verifiedCount(projectId), 0);

        vm.prank(verifier);
        vm.expectRevert(EvidenceRegistry.NotPending.selector);
        evidence.verifyEvidence(id, true, bytes32(0));
    }

    function test_revert_submitByNonProjectCharity() public {
        vm.prank(stranger);
        vm.expectRevert(EvidenceRegistry.NotProjectCharity.selector);
        evidence.submitEvidence(projectId, EvidenceRegistry.Kind.Other, HASH, "");
    }

    function test_revert_suspendedCharityCannotSubmit() public {
        vm.prank(admin);
        charities.suspend(charity);
        vm.prank(charity);
        vm.expectRevert(EvidenceRegistry.NotProjectCharity.selector);
        evidence.submitEvidence(projectId, EvidenceRegistry.Kind.Other, HASH, "");
    }

    function test_revert_emptyAndDuplicateHash() public {
        vm.prank(charity);
        vm.expectRevert(EvidenceRegistry.EmptyHash.selector);
        evidence.submitEvidence(projectId, EvidenceRegistry.Kind.Other, bytes32(0), "");

        _submit(HASH);
        vm.prank(charity);
        vm.expectRevert(EvidenceRegistry.DuplicateEvidence.selector);
        evidence.submitEvidence(projectId, EvidenceRegistry.Kind.Other, HASH, "");
    }

    function test_revert_verifyRoleAndSelfVerification() public {
        uint256 id = _submit(HASH);

        vm.prank(stranger);
        vm.expectRevert();
        evidence.verifyEvidence(id, true, bytes32(0));

        vm.startPrank(admin);
        evidence.grantRole(evidence.VERIFIER_ROLE(), charity);
        vm.stopPrank();
        vm.prank(charity);
        vm.expectRevert(EvidenceRegistry.SelfVerification.selector);
        evidence.verifyEvidence(id, true, bytes32(0));
    }

    function test_reportRequiresVerifiedEvidenceAndVersions() public {
        bytes32 r1 = keccak256("report-1");

        vm.prank(charity);
        vm.expectRevert(ImpactReportRegistry.NoVerifiedEvidence.selector);
        reports.publishReport(projectId, r1, "local://report/1");

        uint256 id = _submit(HASH);
        vm.prank(verifier);
        evidence.verifyEvidence(id, true, bytes32(0));

        vm.prank(charity);
        assertEq(reports.publishReport(projectId, r1, "local://report/1"), 1);
        vm.prank(admin);
        assertEq(reports.publishReport(projectId, keccak256("report-2"), "local://report/2"), 2);

        assertEq(reports.reportCount(projectId), 2);
        assertEq(reports.reportAt(projectId, 0).reportHash, r1);
        assertEq(reports.latestReport(projectId).version, 2);
    }

    function test_revert_reportByStrangerOrUnknownProject() public {
        uint256 id = _submit(HASH);
        vm.prank(verifier);
        evidence.verifyEvidence(id, true, bytes32(0));

        vm.prank(stranger);
        vm.expectRevert(ImpactReportRegistry.NotAuthorized.selector);
        reports.publishReport(projectId, keccak256("r"), "");

        vm.prank(admin);
        vm.expectRevert(ImpactReportRegistry.NotAuthorized.selector);
        reports.publishReport(777, keccak256("r"), "");

        vm.prank(charity);
        vm.expectRevert(ImpactReportRegistry.EmptyHash.selector);
        reports.publishReport(projectId, bytes32(0), "");
    }
}
