// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {ProductCampaign} from "../src/ProductCampaign.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";
import {CharityRegistry} from "../src/CharityRegistry.sol";
import {PauseController} from "../src/PauseController.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

contract ProductCampaignTest is Base {
    function test_publishSnapshotsPartiesAndVersions() public {
        uint256 v1 = _publish(_fixedCampaign());
        ProductCampaign.Campaign memory c1 = campaigns.getCampaign(v1);
        assertEq(c1.merchant, merchant);
        assertEq(c1.merchantReceiver, merchantReceiver);
        assertEq(c1.charityTreasury, address(treasury));
        assertEq(c1.serviceFeeBps, FEE_BPS);
        assertEq(c1.ruleVersion, 1);
        assertEq(campaigns.latestCampaignOf(PRODUCT), v1);

        uint256 v2 = _publish(_fixedCampaign());
        assertEq(campaigns.getCampaign(v2).ruleVersion, 2);
        assertEq(uint8(campaigns.getCampaign(v1).status), uint8(ProductCampaign.Status.Superseded));
        assertEq(campaigns.latestCampaignOf(PRODUCT), v2);
    }

    function test_feeChangeDoesNotAffectExistingCampaign() public {
        uint256 id = _publish(_fixedCampaign());
        vm.prank(admin);
        campaigns.setDefaultServiceFeeBps(500);
        assertEq(campaigns.getCampaign(id).serviceFeeBps, FEE_BPS);
    }

    function test_revert_notApprovedMerchant() public {
        vm.prank(stranger);
        vm.expectRevert(ProductCampaign.NotApprovedMerchant.selector);
        campaigns.createCampaign(_fixedCampaign());
    }

    function test_revert_productOwnedByOtherMerchant() public {
        _publish(_fixedCampaign());

        address other = makeAddr("other");
        vm.prank(other);
        merchants.applyAsMerchant(other, bytes32(0));
        vm.prank(admin);
        merchants.approve(other);

        vm.prank(other);
        vm.expectRevert(ProductCampaign.NotProductOwner.selector);
        campaigns.createCampaign(_fixedCampaign());
    }

    function test_revert_tokenNotAllowed() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.paymentToken = address(0xBEEF);
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.TokenNotAllowed.selector);
        campaigns.createCampaign(p);
    }

    function test_revert_projectNotActive() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.projectId = 999;
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.ProjectNotActive.selector);
        campaigns.createCampaign(p);
    }

    function test_revert_priceZero() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.unitPrice = 0;
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.InvalidPrice.selector);
        campaigns.createCampaign(p);
    }

    function test_revert_donationRuleMustBeExactlyOne() public {
        ProductCampaign.NewCampaign memory both = _fixedCampaign();
        both.percentageDonationBps = 100;
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.InvalidDonationRule.selector);
        campaigns.createCampaign(both);

        ProductCampaign.NewCampaign memory none = _fixedCampaign();
        none.fixedDonationAmount = 0;
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.InvalidDonationRule.selector);
        campaigns.createCampaign(none);
    }

    function test_revert_fixedDonationLeavesNothingForMerchant() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.fixedDonationAmount = PRICE;
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.InvalidDonationRule.selector);
        campaigns.createCampaign(p);
    }

    function test_revert_percentagePlusFeeAbove100() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.fixedDonationAmount = 0;
        p.percentageDonationBps = 10_000 - FEE_BPS + 1;
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.InvalidDonationRule.selector);
        campaigns.createCampaign(p);
    }

    function test_revert_badSaleWindow() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.saleEnd = p.saleStart;
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.InvalidSaleWindow.selector);
        campaigns.createCampaign(p);
    }

    function test_revert_refundWindowTooLong() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.refundWindow = 31 days;
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.InvalidRefundWindow.selector);
        campaigns.createCampaign(p);
    }

    function test_setPausedOnlyByCampaignMerchant() public {
        uint256 id = _publish(_fixedCampaign());

        vm.prank(stranger);
        vm.expectRevert(ProductCampaign.NotProductOwner.selector);
        campaigns.setPaused(id, true);

        vm.prank(merchant);
        campaigns.setPaused(id, true);
        assertEq(uint8(campaigns.getCampaign(id).status), uint8(ProductCampaign.Status.Paused));
    }

    function test_supersededCannotBeUnpaused() public {
        uint256 v1 = _publish(_fixedCampaign());
        _publish(_fixedCampaign());
        vm.prank(merchant);
        vm.expectRevert(ProductCampaign.InvalidState.selector);
        campaigns.setPaused(v1, false);
    }

    function test_feeCapAndAdminOnly() public {
        vm.prank(admin);
        vm.expectRevert(ProductCampaign.FeeTooHigh.selector);
        campaigns.setDefaultServiceFeeBps(1_001);

        vm.prank(stranger);
        vm.expectRevert();
        campaigns.setDefaultServiceFeeBps(100);

        vm.prank(stranger);
        vm.expectRevert();
        campaigns.setAllowedToken(address(1), true);
    }

    function test_pauseControllerRoleGate() public {
        vm.prank(stranger);
        vm.expectRevert();
        pauser.setGlobalPaused(true);

        assertFalse(pauser.isSaleBlocked(1, 1));
        vm.prank(admin);
        pauser.setProjectPaused(1, true, "x");
        assertTrue(pauser.isSaleBlocked(2, 1));
        assertFalse(pauser.isSaleBlocked(2, 2));
    }
}

contract RegistriesTest is Base {
    function test_merchantLifecycle() public {
        address m = makeAddr("m2");
        vm.prank(m);
        merchants.applyAsMerchant(m, bytes32(uint256(1)));
        assertFalse(merchants.isApproved(m));

        vm.prank(m);
        vm.expectRevert(MerchantRegistry.InvalidState.selector);
        merchants.applyAsMerchant(m, bytes32(uint256(1)));

        vm.prank(admin);
        merchants.reject(m);
        vm.prank(m);
        merchants.applyAsMerchant(m, bytes32(uint256(2)));

        vm.startPrank(admin);
        merchants.approve(m);
        assertTrue(merchants.isApproved(m));
        merchants.suspend(m);
        assertFalse(merchants.isApproved(m));
        merchants.approve(m);
        vm.stopPrank();
        assertTrue(merchants.isApproved(m));
    }

    function test_merchantAdminOnlyAndReceiverCheck() public {
        vm.prank(stranger);
        vm.expectRevert(MerchantRegistry.InvalidReceiver.selector);
        merchants.applyAsMerchant(address(0), bytes32(0));

        vm.prank(stranger);
        merchants.applyAsMerchant(stranger, bytes32(0));
        vm.prank(stranger);
        vm.expectRevert();
        merchants.approve(stranger);
    }

    function test_merchantApplicantListIsPaginatedAndDeduplicated() public {
        address m2 = makeAddr("list2");
        address m3 = makeAddr("list3");
        assertEq(merchants.applicantCount(), 1);

        vm.prank(m2);
        merchants.applyAsMerchant(m2, bytes32(uint256(1)));
        vm.prank(admin);
        merchants.reject(m2);
        vm.warp(block.timestamp + 1 days);
        vm.prank(m2);
        merchants.applyAsMerchant(m2, bytes32(uint256(2)));
        vm.prank(m3);
        merchants.applyAsMerchant(m3, bytes32(uint256(3)));

        assertEq(merchants.applicantCount(), 3);
        assertEq(merchants.getMerchant(m2).appliedAt, block.timestamp);

        address[] memory first = merchants.getApplicants(0, 2);
        assertEq(first.length, 2);
        assertEq(first[0], merchant);
        assertEq(first[1], m2);

        address[] memory rest = merchants.getApplicants(2, 10);
        assertEq(rest.length, 1);
        assertEq(rest[0], m3);
        assertEq(merchants.getApplicants(3, 10).length, 0);
        assertEq(merchants.getApplicants(0, 0).length, 0);
    }

    function test_charityLifecycleAndProjects() public {
        assertTrue(charities.isProjectActive(projectId));

        vm.prank(admin);
        charities.suspend(charity);
        assertFalse(charities.isProjectActive(projectId));

        vm.prank(charity);
        vm.expectRevert(CharityRegistry.NotApprovedCharity.selector);
        charities.createProject(address(treasury), bytes32(0), 1);

        vm.prank(admin);
        charities.approve(charity);
        assertTrue(charities.isProjectActive(projectId));
    }

    function test_projectStatusTransitions() public {
        vm.prank(stranger);
        vm.expectRevert(CharityRegistry.NotProjectOwner.selector);
        charities.setProjectStatus(projectId, CharityRegistry.ProjectStatus.Completed);

        vm.startPrank(charity);
        vm.expectRevert(CharityRegistry.InvalidState.selector);
        charities.setProjectStatus(projectId, CharityRegistry.ProjectStatus.Active);
        charities.setProjectStatus(projectId, CharityRegistry.ProjectStatus.Completed);
        vm.expectRevert(CharityRegistry.InvalidState.selector);
        charities.setProjectStatus(projectId, CharityRegistry.ProjectStatus.Closed);
        vm.stopPrank();
        assertFalse(charities.isProjectActive(projectId));
    }

    function test_createProjectRejectsZeroTreasury() public {
        vm.prank(charity);
        vm.expectRevert(CharityRegistry.InvalidTreasury.selector);
        charities.createProject(address(0), bytes32(0), 1);
    }
}
