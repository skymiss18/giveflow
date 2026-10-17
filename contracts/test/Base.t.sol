// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";
import {CharityRegistry} from "../src/CharityRegistry.sol";
import {PauseController} from "../src/PauseController.sol";
import {ProductCampaign} from "../src/ProductCampaign.sol";
import {CheckoutRouter} from "../src/CheckoutRouter.sol";
import {DonationTreasury} from "../src/DonationTreasury.sol";
import {TreasuryFactory} from "../src/TreasuryFactory.sol";
import {EvidenceRegistry} from "../src/EvidenceRegistry.sol";
import {ImpactReportRegistry} from "../src/ImpactReportRegistry.sol";

abstract contract Base is Test {
    address internal admin = makeAddr("admin");
    address internal merchant = makeAddr("merchant");
    address internal merchantReceiver = makeAddr("merchantReceiver");
    address internal charity = makeAddr("charity");
    address internal buyer = makeAddr("buyer");
    address internal verifier = makeAddr("verifier");
    address internal platform = makeAddr("platform");
    address internal signer1 = makeAddr("signer1");
    address internal signer2 = makeAddr("signer2");
    address internal signer3 = makeAddr("signer3");
    address internal stranger = makeAddr("stranger");

    MockUSDC internal usdc;
    MerchantRegistry internal merchants;
    CharityRegistry internal charities;
    PauseController internal pauser;
    ProductCampaign internal campaigns;
    CheckoutRouter internal router;
    EvidenceRegistry internal evidence;
    ImpactReportRegistry internal reports;
    TreasuryFactory internal factory;
    DonationTreasury internal treasury;

    uint256 internal projectId;
    uint16 internal constant FEE_BPS = 200;
    uint256 internal constant PRICE = 25e6;
    uint256 internal constant FIXED = 1e6;
    bytes32 internal constant PRODUCT = keccak256("edu-kit");

    function setUp() public virtual {
        vm.warp(1_700_000_000);

        vm.startPrank(admin);
        usdc = new MockUSDC();
        merchants = new MerchantRegistry(admin);
        charities = new CharityRegistry(admin);
        pauser = new PauseController(admin);
        campaigns = new ProductCampaign(admin, merchants, charities, FEE_BPS);
        router = new CheckoutRouter(admin, campaigns, pauser, platform);
        evidence = new EvidenceRegistry(admin, charities);
        reports = new ImpactReportRegistry(admin, charities, evidence);
        factory = new TreasuryFactory();
        campaigns.setAllowedToken(address(usdc), true);
        evidence.grantRole(evidence.VERIFIER_ROLE(), verifier);
        vm.stopPrank();

        vm.prank(merchant);
        merchants.applyAsMerchant(merchantReceiver, keccak256("merchant-profile"));
        vm.prank(admin);
        merchants.approve(merchant);

        vm.prank(charity);
        charities.applyAsCharity(keccak256("charity-profile"));
        vm.prank(admin);
        charities.approve(charity);

        address[] memory owners = new address[](3);
        owners[0] = signer1;
        owners[1] = signer2;
        owners[2] = signer3;
        treasury = DonationTreasury(factory.createTreasury(owners, 2));

        vm.prank(charity);
        projectId = charities.createProject(address(treasury), keccak256("project"), 5_000e6);

        usdc.faucet(buyer, 1_000e6);
        vm.prank(buyer);
        usdc.approve(address(router), type(uint256).max);
    }

    function _fixedCampaign() internal view returns (ProductCampaign.NewCampaign memory p) {
        p = ProductCampaign.NewCampaign({
            productId: PRODUCT,
            projectId: projectId,
            paymentToken: address(usdc),
            unitPrice: PRICE,
            fixedDonationAmount: FIXED,
            percentageDonationBps: 0,
            saleStart: uint64(block.timestamp),
            saleEnd: uint64(block.timestamp + 30 days),
            refundWindow: 0,
            maxDonation: 0,
            metadataHash: keccak256("product-meta")
        });
    }

    function _publish(ProductCampaign.NewCampaign memory p) internal returns (uint256) {
        vm.prank(merchant);
        return campaigns.createCampaign(p);
    }

    function _buy(uint256 campaignId, uint32 qty, bytes32 orderHash) internal returns (bytes32) {
        return _buyAs(buyer, campaignId, qty, orderHash);
    }

    function _buyReverts(uint256 campaignId, uint32 qty, bytes32 orderHash, bytes4 selector) internal {
        ProductCampaign.Campaign memory c = campaigns.getCampaign(campaignId);
        vm.prank(buyer);
        vm.expectRevert(selector);
        router.checkout(
            c.productId, campaignId, qty, c.paymentToken, orderHash, c.unitPrice, uint64(block.timestamp + 1 hours)
        );
    }

    function _buyAs(address who, uint256 campaignId, uint32 qty, bytes32 orderHash) internal returns (bytes32) {
        ProductCampaign.Campaign memory c = campaigns.getCampaign(campaignId);
        vm.prank(who);
        return router.checkout(
            c.productId, campaignId, qty, c.paymentToken, orderHash, c.unitPrice, uint64(block.timestamp + 1 hours)
        );
    }
}
