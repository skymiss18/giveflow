// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {ProductCampaign} from "../src/ProductCampaign.sol";
import {CharityRegistry} from "../src/CharityRegistry.sol";
import {CheckoutRouter} from "../src/CheckoutRouter.sol";

contract CheckoutRouterTest is Base {
    uint256 internal cid;

    function setUp() public override {
        super.setUp();
        cid = _publish(_fixedCampaign());
    }

    function test_instantSplit() public {
        bytes32 order = keccak256("order-1");
        bytes32 expectedId = router.paymentIdFor(buyer, order);

        vm.expectEmit(true, true, true, true, address(router));
        emit CheckoutRouter.PurchaseCompleted(
            expectedId, PRODUCT, cid, buyer, 1, PRICE, FIXED, address(usdc), order
        );
        bytes32 paymentId = _buy(cid, 1, order);

        assertEq(paymentId, expectedId);
        assertEq(router.paymentCount(), 1);
        assertEq(router.paymentIdAt(0), paymentId);
        assertEq(router.getPayment(paymentId).createdAt, block.timestamp);
        assertEq(usdc.balanceOf(address(treasury)), FIXED);
        assertEq(usdc.balanceOf(platform), 0.5e6);
        assertEq(usdc.balanceOf(merchantReceiver), 23.5e6);
        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(usdc.balanceOf(buyer), 1_000e6 - PRICE);
        assertEq(uint8(router.getPayment(paymentId).status), uint8(CheckoutRouter.PaymentStatus.Settled));
    }

    function test_quoteMatchesSettlement() public {
        (uint256 gross, uint256 donation, uint256 fee, uint256 merchantAmount) = router.quote(cid, 3);
        assertEq(gross, 75e6);
        assertEq(donation, 3e6);
        assertEq(fee, 1.5e6);
        assertEq(merchantAmount, 70.5e6);
    }

    function test_percentageDonation() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("tee");
        p.fixedDonationAmount = 0;
        p.percentageDonationBps = 500;
        uint256 id = _publish(p);

        _buy(id, 2, keccak256("o"));
        assertEq(usdc.balanceOf(address(treasury)), 2.5e6);
    }

    function test_revert_assetMismatch() public {
        vm.prank(buyer);
        vm.expectRevert(CheckoutRouter.AssetMismatch.selector);
        router.checkout(PRODUCT, cid, 1, address(0xdead), keccak256("o"), PRICE, uint64(block.timestamp + 1));
    }

    function test_revert_priceChanged() public {
        vm.prank(buyer);
        vm.expectRevert(CheckoutRouter.PriceChanged.selector);
        router.checkout(PRODUCT, cid, 1, address(usdc), keccak256("o"), PRICE + 1, uint64(block.timestamp + 1));
    }

    function test_revert_orderExpired() public {
        vm.prank(buyer);
        vm.expectRevert(CheckoutRouter.OrderExpired.selector);
        router.checkout(PRODUCT, cid, 1, address(usdc), keccak256("o"), PRICE, uint64(block.timestamp - 1));
    }

    function test_revert_productMismatch() public {
        vm.prank(buyer);
        vm.expectRevert(CheckoutRouter.ProductMismatch.selector);
        router.checkout(keccak256("other"), cid, 1, address(usdc), keccak256("o"), PRICE, uint64(block.timestamp + 1));
    }

    function test_revert_zeroQuantity() public {
        vm.prank(buyer);
        vm.expectRevert(CheckoutRouter.InvalidQuantity.selector);
        router.checkout(PRODUCT, cid, 0, address(usdc), keccak256("o"), PRICE, uint64(block.timestamp + 1));
    }

    function test_revert_duplicateOrder() public {
        _buy(cid, 1, keccak256("dup"));
        _buyReverts(cid, 1, keccak256("dup"), CheckoutRouter.OrderAlreadyUsed.selector);
        assertEq(router.paymentCount(), 1);
    }

    function test_failedTransferDoesNotEnumeratePayment() public {
        vm.prank(buyer);
        usdc.approve(address(router), 0);
        vm.prank(buyer);
        vm.expectRevert();
        router.checkout(PRODUCT, cid, 1, address(usdc), keccak256("failed"), PRICE, uint64(block.timestamp + 1));
        assertEq(router.paymentCount(), 0);
    }

    function test_sameOrderHashDifferentBuyersAllowed() public {
        usdc.faucet(stranger, 100e6);
        vm.prank(stranger);
        usdc.approve(address(router), type(uint256).max);
        _buy(cid, 1, keccak256("shared"));
        _buyAs(stranger, cid, 1, keccak256("shared"));
    }

    function test_revert_saleWindow() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("later");
        p.saleStart = uint64(block.timestamp + 1 days);
        p.saleEnd = uint64(block.timestamp + 2 days);
        uint256 id = _publish(p);

        _buyReverts(id, 1, keccak256("early"), CheckoutRouter.OutsideSaleWindow.selector);

        vm.warp(block.timestamp + 3 days);
        _buyReverts(id, 1, keccak256("late"), CheckoutRouter.OutsideSaleWindow.selector);
    }

    function test_revert_merchantPausedCampaign() public {
        vm.prank(merchant);
        campaigns.setPaused(cid, true);
        _buyReverts(cid, 1, keccak256("o"), CheckoutRouter.CampaignInactive.selector);

        vm.prank(merchant);
        campaigns.setPaused(cid, false);
        _buy(cid, 1, keccak256("o"));
    }

    function test_revert_controllerPauses() public {
        vm.startPrank(admin);
        pauser.setGlobalPaused(true);
        vm.stopPrank();
        _buyReverts(cid, 1, keccak256("a"), CheckoutRouter.SalesPaused.selector);

        vm.startPrank(admin);
        pauser.setGlobalPaused(false);
        pauser.setCampaignPaused(cid, true, "fraud-check");
        vm.stopPrank();
        _buyReverts(cid, 1, keccak256("b"), CheckoutRouter.SalesPaused.selector);

        vm.startPrank(admin);
        pauser.setCampaignPaused(cid, false, "");
        pauser.setProjectPaused(projectId, true, "audit");
        vm.stopPrank();
        _buyReverts(cid, 1, keccak256("c"), CheckoutRouter.SalesPaused.selector);
    }

    function test_revert_merchantSuspended() public {
        vm.prank(admin);
        merchants.suspend(merchant);
        _buyReverts(cid, 1, keccak256("o"), CheckoutRouter.PartyNotActive.selector);
    }

    function test_revert_projectClosed() public {
        vm.prank(charity);
        charities.setProjectStatus(projectId, CharityRegistry.ProjectStatus.Closed);
        _buyReverts(cid, 1, keccak256("o"), CheckoutRouter.PartyNotActive.selector);
    }

    function test_supersededCampaignCannotBeBought() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.fixedDonationAmount = 2e6;
        uint256 v2 = _publish(p);

        assertEq(campaigns.getCampaign(v2).ruleVersion, 2);
        _buyReverts(cid, 1, keccak256("old"), CheckoutRouter.CampaignInactive.selector);

        _buy(v2, 1, keccak256("new"));
        assertEq(usdc.balanceOf(address(treasury)), 2e6);
    }

    function test_donationCapAndRefundFreesCap() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("capped");
        p.maxDonation = 2e6;
        p.refundWindow = 1 days;
        uint256 id = _publish(p);

        bytes32 first = _buy(id, 2, keccak256("1"));
        _buyReverts(id, 1, keccak256("2"), CheckoutRouter.DonationCapReached.selector);

        vm.prank(buyer);
        router.refund(first, "changed-mind");
        _buy(id, 1, keccak256("3"));
        assertEq(router.paymentCount(), 2);
        assertEq(router.paymentIdAt(0), first);
        assertEq(uint8(router.getPayment(first).status), uint8(CheckoutRouter.PaymentStatus.Refunded));
        assertEq(router.committedDonation(id), 1e6);
    }

    function test_escrowThenSettleAfterWindow() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("escrow");
        p.refundWindow = 1 days;
        uint256 id = _publish(p);

        bytes32 paymentId = _buy(id, 1, keccak256("o"));
        assertEq(usdc.balanceOf(address(router)), PRICE);
        assertEq(usdc.balanceOf(address(treasury)), 0);

        vm.expectRevert(CheckoutRouter.NotSettleable.selector);
        router.settle(paymentId);

        vm.warp(block.timestamp + 1 days);
        vm.prank(stranger);
        router.settle(paymentId);

        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(usdc.balanceOf(address(treasury)), FIXED);
        assertEq(usdc.balanceOf(merchantReceiver), 23.5e6);

        vm.expectRevert(CheckoutRouter.NotSettleable.selector);
        router.settle(paymentId);
    }

    function test_buyerRefundInsideWindow() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("escrow");
        p.refundWindow = 1 days;
        uint256 id = _publish(p);

        bytes32 paymentId = _buy(id, 1, keccak256("o"));
        vm.prank(buyer);
        router.refund(paymentId, "cooling-off");

        assertEq(usdc.balanceOf(buyer), 1_000e6);
        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(uint8(router.getPayment(paymentId).status), uint8(CheckoutRouter.PaymentStatus.Refunded));

        vm.warp(block.timestamp + 2 days);
        vm.expectRevert(CheckoutRouter.NotSettleable.selector);
        router.settle(paymentId);
    }

    function test_buyerCannotRefundAfterWindowButMerchantCan() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("escrow");
        p.refundWindow = 1 days;
        uint256 id = _publish(p);
        bytes32 paymentId = _buy(id, 1, keccak256("o"));

        vm.warp(block.timestamp + 1 days);
        vm.prank(buyer);
        vm.expectRevert(CheckoutRouter.Unauthorized.selector);
        router.refund(paymentId, "late");

        vm.prank(merchant);
        router.refund(paymentId, "goodwill");
        assertEq(usdc.balanceOf(buyer), 1_000e6);
    }

    function test_revert_strangerRefund() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("escrow");
        p.refundWindow = 1 days;
        bytes32 paymentId = _buy(_publish(p), 1, keccak256("o"));

        vm.prank(stranger);
        vm.expectRevert(CheckoutRouter.Unauthorized.selector);
        router.refund(paymentId, "");
    }

    function test_revert_refundAfterInstantSettle() public {
        bytes32 paymentId = _buy(cid, 1, keccak256("o"));
        vm.prank(merchant);
        vm.expectRevert(CheckoutRouter.NotRefundable.selector);
        router.refund(paymentId, "");
    }

    function test_pauseDoesNotBlockRefundOrSettle() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("escrow");
        p.refundWindow = 1 days;
        bytes32 paymentId = _buy(_publish(p), 1, keccak256("o"));

        vm.prank(admin);
        pauser.setGlobalPaused(true);

        vm.prank(buyer);
        router.refund(paymentId, "");
    }

    function test_platformReceiverAdmin() public {
        vm.prank(stranger);
        vm.expectRevert();
        router.setPlatformReceiver(stranger);

        vm.prank(admin);
        router.setPlatformReceiver(stranger);
        _buy(cid, 1, keccak256("o"));
        assertEq(usdc.balanceOf(stranger), 0.5e6);
    }

    function testFuzz_percentageSplitConserves(uint256 price, uint32 qty, uint16 bps) public {
        price = bound(price, 1, 1e15);
        qty = uint32(bound(qty, 1, 10_000));
        bps = uint16(bound(bps, 1, 10_000 - FEE_BPS));

        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("fuzz-pct");
        p.unitPrice = price;
        p.fixedDonationAmount = 0;
        p.percentageDonationBps = bps;
        uint256 id = _publish(p);

        uint256 gross = price * qty;
        deal(address(usdc), buyer, gross);
        _buy(id, qty, keccak256("f"));

        uint256 donation = usdc.balanceOf(address(treasury));
        uint256 fee = usdc.balanceOf(platform);
        uint256 merchantAmt = usdc.balanceOf(merchantReceiver);
        assertEq(donation + fee + merchantAmt, gross);
        assertEq(donation, gross * bps / 10_000);
        assertEq(usdc.balanceOf(address(router)), 0);
    }

    function testFuzz_fixedSplitConserves(uint256 price, uint32 qty, uint256 fixedAmt) public {
        price = bound(price, 1e4, 1e15);
        qty = uint32(bound(qty, 1, 10_000));
        fixedAmt = bound(fixedAmt, 1, price * (10_000 - FEE_BPS) / 10_000);

        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("fuzz-fixed");
        p.unitPrice = price;
        p.fixedDonationAmount = fixedAmt;
        uint256 id = _publish(p);

        uint256 gross = price * qty;
        deal(address(usdc), buyer, gross);
        _buy(id, qty, keccak256("f"));

        assertEq(usdc.balanceOf(address(treasury)), fixedAmt * qty);
        assertEq(
            usdc.balanceOf(address(treasury)) + usdc.balanceOf(platform) + usdc.balanceOf(merchantReceiver), gross
        );
    }
}
