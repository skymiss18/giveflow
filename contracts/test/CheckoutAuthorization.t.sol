// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Base} from "./Base.t.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {ProductCampaign} from "../src/ProductCampaign.sol";
import {CheckoutRouter} from "../src/CheckoutRouter.sol";

contract CheckoutAuthorizationTest is Base {
    address internal payer;
    uint256 internal payerKey;
    uint256 internal cid;

    function setUp() public override {
        super.setUp();
        (payer, payerKey) = makeAddrAndKey("payer");
        usdc.faucet(payer, 1_000e6);
        cid = _publish(_fixedCampaign());
    }

    function _order(uint256 campaignId, uint32 qty, bytes32 orderHash)
        internal
        view
        returns (CheckoutRouter.Order memory)
    {
        ProductCampaign.Campaign memory c = campaigns.getCampaign(campaignId);
        return CheckoutRouter.Order(
            c.productId, campaignId, qty, c.paymentToken, orderHash, c.unitPrice, uint64(block.timestamp + 1 hours)
        );
    }

    function _auth(uint256 key, address from, uint256 value, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (CheckoutRouter.Authorization memory a)
    {
        bytes32 structHash = keccak256(
            abi.encode(usdc.RECEIVE_WITH_AUTHORIZATION_TYPEHASH(), from, address(router), value, 0, validBefore, nonce)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", usdc.DOMAIN_SEPARATOR(), structHash));
        a.validBefore = validBefore;
        (a.v, a.r, a.s) = vm.sign(key, digest);
    }

    function _signed(uint256 key, address from, CheckoutRouter.Order memory o)
        internal
        view
        returns (CheckoutRouter.Authorization memory)
    {
        (uint256 gross,,,) = router.quote(o.campaignId, o.quantity);
        return _auth(key, from, gross, o.orderExpiry, router.authorizationNonce(from, o));
    }

    function test_relayerSubmitsSignedOrderWithoutApproval() public {
        CheckoutRouter.Order memory o = _order(cid, 1, keccak256("auth-1"));
        CheckoutRouter.Authorization memory a = _signed(payerKey, payer, o);

        assertEq(usdc.allowance(payer, address(router)), 0);
        vm.prank(stranger);
        bytes32 paymentId = router.checkoutWithAuthorization(payer, o, a);

        assertEq(paymentId, router.paymentIdFor(payer, o.orderHash));
        assertEq(router.getPayment(paymentId).buyer, payer);
        assertEq(usdc.balanceOf(payer), 1_000e6 - PRICE);
        assertEq(usdc.balanceOf(address(treasury)), FIXED);
        assertEq(usdc.balanceOf(platform), 0.5e6);
        assertEq(usdc.balanceOf(merchantReceiver), 23.5e6);
        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(usdc.balanceOf(stranger), 0);
    }

    function test_escrowedPaymentRefundsToSigner() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("escrow");
        p.refundWindow = 3 days;
        uint256 id = _publish(p);

        CheckoutRouter.Order memory o = _order(id, 2, keccak256("auth-escrow"));
        bytes32 paymentId = router.checkoutWithAuthorization(payer, o, _signed(payerKey, payer, o));
        assertEq(usdc.balanceOf(address(router)), 2 * PRICE);

        vm.prank(payer);
        router.refund(paymentId, bytes32("changed mind"));
        assertEq(usdc.balanceOf(payer), 1_000e6);
        assertEq(usdc.balanceOf(address(router)), 0);
    }

    function test_revert_signedByAnotherKey() public {
        (, uint256 otherKey) = makeAddrAndKey("other");
        CheckoutRouter.Order memory o = _order(cid, 1, keccak256("auth-bad"));
        CheckoutRouter.Authorization memory a = _signed(otherKey, payer, o);

        vm.expectRevert(MockUSDC.InvalidSignature.selector);
        router.checkoutWithAuthorization(payer, o, a);
    }

    function test_revert_replay() public {
        CheckoutRouter.Order memory o = _order(cid, 1, keccak256("auth-replay"));
        CheckoutRouter.Authorization memory a = _signed(payerKey, payer, o);
        router.checkoutWithAuthorization(payer, o, a);

        vm.expectRevert(CheckoutRouter.OrderAlreadyUsed.selector);
        router.checkoutWithAuthorization(payer, o, a);
    }

    function test_revert_relayerChangesQuantity() public {
        CheckoutRouter.Order memory o = _order(cid, 1, keccak256("auth-qty"));
        CheckoutRouter.Authorization memory a = _signed(payerKey, payer, o);
        o.quantity = 2;

        vm.expectRevert(MockUSDC.InvalidSignature.selector);
        router.checkoutWithAuthorization(payer, o, a);
    }

    function test_revert_relayerSwapsCampaign() public {
        ProductCampaign.NewCampaign memory p = _fixedCampaign();
        p.productId = keccak256("other-product");
        uint256 otherId = _publish(p);

        CheckoutRouter.Order memory o = _order(cid, 1, keccak256("auth-swap"));
        CheckoutRouter.Authorization memory a = _signed(payerKey, payer, o);
        CheckoutRouter.Order memory swapped = _order(otherId, 1, o.orderHash);
        swapped.orderExpiry = o.orderExpiry;

        vm.expectRevert(MockUSDC.InvalidSignature.selector);
        router.checkoutWithAuthorization(payer, swapped, a);
    }

    function test_revert_relayerChangesBuyer() public {
        CheckoutRouter.Order memory o = _order(cid, 1, keccak256("auth-buyer"));
        CheckoutRouter.Authorization memory a = _signed(payerKey, payer, o);
        usdc.faucet(stranger, 100e6);

        vm.expectRevert(MockUSDC.InvalidSignature.selector);
        router.checkoutWithAuthorization(stranger, o, a);
    }

    function test_revert_authorizationOutlivesOrder() public {
        CheckoutRouter.Order memory o = _order(cid, 1, keccak256("auth-long"));
        CheckoutRouter.Authorization memory a = _auth(payerKey, payer, PRICE, o.orderExpiry + 1, router.authorizationNonce(payer, o));

        vm.expectRevert(CheckoutRouter.AuthorizationOutlivesOrder.selector);
        router.checkoutWithAuthorization(payer, o, a);
    }

    function test_revert_authorizationExpired() public {
        CheckoutRouter.Order memory o = _order(cid, 1, keccak256("auth-expired"));
        o.orderExpiry = uint64(block.timestamp);
        CheckoutRouter.Authorization memory a = _signed(payerKey, payer, o);

        vm.expectRevert(MockUSDC.AuthorizationExpired.selector);
        router.checkoutWithAuthorization(payer, o, a);
    }

    function test_revert_stillEnforcesCampaignRules() public {
        vm.prank(merchant);
        campaigns.setPaused(cid, true);
        CheckoutRouter.Order memory o = _order(cid, 1, keccak256("auth-paused"));
        CheckoutRouter.Authorization memory a = _signed(payerKey, payer, o);

        vm.expectRevert(CheckoutRouter.CampaignInactive.selector);
        router.checkoutWithAuthorization(payer, o, a);
    }

    function test_revert_tokenCallerMustBePayee() public {
        bytes32 nonce = keccak256("direct");
        CheckoutRouter.Authorization memory a = _auth(payerKey, payer, PRICE, block.timestamp + 1 hours, nonce);

        vm.prank(stranger);
        vm.expectRevert(MockUSDC.CallerMustBePayee.selector);
        usdc.receiveWithAuthorization(payer, address(router), PRICE, 0, a.validBefore, nonce, a.v, a.r, a.s);
    }
}
