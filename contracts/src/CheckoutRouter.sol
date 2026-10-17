// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerchantRegistry} from "./MerchantRegistry.sol";
import {CharityRegistry} from "./CharityRegistry.sol";
import {ProductCampaign} from "./ProductCampaign.sol";
import {PauseController} from "./PauseController.sol";

interface IERC3009 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// @notice Pulls the buyer's payment into escrow, then splits it into merchant, charity and platform shares.
/// With refundWindow == 0 the split happens in the checkout transaction itself.
contract CheckoutRouter is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum PaymentStatus {
        None,
        Escrowed,
        Settled,
        Refunded
    }

    struct Payment {
        uint256 campaignId;
        address buyer;
        uint32 quantity;
        uint64 settleAfter;
        PaymentStatus status;
        uint256 gross;
        uint256 donation;
        uint256 fee;
        bytes32 orderHash;
    }

    struct Order {
        bytes32 productId;
        uint256 campaignId;
        uint32 quantity;
        address paymentToken;
        bytes32 orderHash;
        uint256 quotedUnitPrice;
        uint64 orderExpiry;
    }

    struct Authorization {
        uint256 validAfter;
        uint256 validBefore;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    uint256 private constant BPS = 10_000;

    ProductCampaign public immutable campaigns;
    MerchantRegistry public immutable merchants;
    CharityRegistry public immutable charities;
    PauseController public immutable pauseController;

    address public platformReceiver;
    mapping(bytes32 => Payment) private _payments;
    mapping(uint256 => uint256) public committedDonation;

    event PurchaseCompleted(
        bytes32 indexed paymentId,
        bytes32 indexed productId,
        uint256 indexed campaignId,
        address buyer,
        uint32 quantity,
        uint256 gross,
        uint256 donation,
        address token,
        bytes32 orderHash
    );
    event PaymentSettled(bytes32 indexed paymentId, uint256 merchantAmount, uint256 donation, uint256 fee);
    event DonationReceived(uint256 indexed projectId, bytes32 indexed paymentId, uint256 amount, address token);
    event RefundExecuted(bytes32 indexed paymentId, uint256 amount, address token, bytes32 reason);
    event PlatformReceiverChanged(address receiver);

    error InvalidQuantity();
    error OrderExpired();
    error ProductMismatch();
    error CampaignInactive();
    error SalesPaused();
    error OutsideSaleWindow();
    error AssetMismatch();
    error PriceChanged();
    error PartyNotActive();
    error OrderAlreadyUsed();
    error DonationCapReached();
    error NotSettleable();
    error NotRefundable();
    error Unauthorized();
    error ZeroAddress();
    error AuthorizationOutlivesOrder();

    constructor(
        address owner_,
        ProductCampaign campaigns_,
        PauseController pauseController_,
        address platformReceiver_
    ) Ownable(owner_) {
        if (platformReceiver_ == address(0)) revert ZeroAddress();
        campaigns = campaigns_;
        merchants = campaigns_.merchants();
        charities = campaigns_.charities();
        pauseController = pauseController_;
        platformReceiver = platformReceiver_;
    }

    function setPlatformReceiver(address receiver) external onlyOwner {
        if (receiver == address(0)) revert ZeroAddress();
        platformReceiver = receiver;
        emit PlatformReceiverChanged(receiver);
    }

    /// @notice Classic flow: the buyer approves the router first, then pays.
    function checkout(
        bytes32 productId,
        uint256 campaignId,
        uint32 quantity,
        address paymentToken,
        bytes32 orderHash,
        uint256 quotedUnitPrice,
        uint64 orderExpiry
    ) external nonReentrant returns (bytes32) {
        Order memory o = Order(productId, campaignId, quantity, paymentToken, orderHash, quotedUnitPrice, orderExpiry);
        return _checkout(msg.sender, o, Authorization(0, 0, 0, 0, 0), false);
    }

    /// @notice Single-signature flow (EIP-3009): the buyer signs an authorization bound to this exact order and
    /// anyone may submit it, so a relayer can pay the gas. The buyer never sends a transaction.
    function checkoutWithAuthorization(address buyer, Order calldata o, Authorization calldata a)
        external
        nonReentrant
        returns (bytes32)
    {
        if (a.validBefore > o.orderExpiry) revert AuthorizationOutlivesOrder();
        return _checkout(buyer, o, a, true);
    }

    /// @notice The EIP-3009 nonce the buyer must sign; it commits to every order field and the buyer.
    function authorizationNonce(address buyer, Order memory o) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), buyer, o));
    }

    function settle(bytes32 paymentId) external nonReentrant {
        Payment storage p = _payments[paymentId];
        if (p.status != PaymentStatus.Escrowed || block.timestamp < p.settleAfter) revert NotSettleable();
        _settle(paymentId, campaigns.getCampaign(p.campaignId));
    }

    /// @notice Buyer may refund inside the refund window; the merchant may refund any time before settlement.
    function refund(bytes32 paymentId, bytes32 reason) external nonReentrant {
        Payment storage p = _payments[paymentId];
        if (p.status != PaymentStatus.Escrowed) revert NotRefundable();

        ProductCampaign.Campaign memory c = campaigns.getCampaign(p.campaignId);
        bool byMerchant = msg.sender == c.merchant;
        bool byBuyer = msg.sender == p.buyer && block.timestamp < p.settleAfter;
        if (!byMerchant && !byBuyer) revert Unauthorized();

        p.status = PaymentStatus.Refunded;
        committedDonation[p.campaignId] -= p.donation;
        IERC20(c.paymentToken).safeTransfer(p.buyer, p.gross);
        emit RefundExecuted(paymentId, p.gross, c.paymentToken, reason);
    }

    function paymentIdFor(address buyer, bytes32 orderHash) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), buyer, orderHash));
    }

    function getPayment(bytes32 paymentId) external view returns (Payment memory) {
        return _payments[paymentId];
    }

    function quote(uint256 campaignId, uint32 quantity)
        external
        view
        returns (uint256 gross, uint256 donation, uint256 fee, uint256 merchantAmount)
    {
        return _split(campaigns.getCampaign(campaignId), quantity);
    }

    function _split(ProductCampaign.Campaign memory c, uint32 quantity)
        private
        pure
        returns (uint256 gross, uint256 donation, uint256 fee, uint256 merchantAmount)
    {
        gross = c.unitPrice * quantity;
        donation = c.fixedDonationAmount > 0
            ? c.fixedDonationAmount * quantity
            : gross * c.percentageDonationBps / BPS;
        fee = gross * c.serviceFeeBps / BPS;
        merchantAmount = gross - donation - fee;
    }

    function _checkout(address buyer, Order memory o, Authorization memory a, bool useAuthorization)
        private
        returns (bytes32 paymentId)
    {
        if (o.quantity == 0) revert InvalidQuantity();
        if (block.timestamp > o.orderExpiry) revert OrderExpired();

        ProductCampaign.Campaign memory c = campaigns.getCampaign(o.campaignId);
        if (c.productId != o.productId) revert ProductMismatch();
        if (c.status != ProductCampaign.Status.Active) revert CampaignInactive();
        if (pauseController.isSaleBlocked(o.campaignId, c.projectId)) revert SalesPaused();
        if (block.timestamp < c.saleStart || block.timestamp > c.saleEnd) revert OutsideSaleWindow();
        if (o.paymentToken != c.paymentToken) revert AssetMismatch();
        if (o.quotedUnitPrice != c.unitPrice) revert PriceChanged();
        if (!merchants.isApproved(c.merchant) || !charities.isProjectActive(c.projectId)) revert PartyNotActive();

        paymentId = paymentIdFor(buyer, o.orderHash);
        if (_payments[paymentId].status != PaymentStatus.None) revert OrderAlreadyUsed();

        uint256 gross = _record(paymentId, buyer, o, c);

        if (useAuthorization) {
            IERC3009(o.paymentToken).receiveWithAuthorization(
                buyer, address(this), gross, a.validAfter, a.validBefore, authorizationNonce(buyer, o), a.v, a.r, a.s
            );
        } else {
            IERC20(o.paymentToken).safeTransferFrom(buyer, address(this), gross);
        }
        _emitPurchase(paymentId, o.productId, o.paymentToken);

        if (c.refundWindow == 0) _settle(paymentId, c);
    }

    function _record(bytes32 paymentId, address buyer, Order memory o, ProductCampaign.Campaign memory c)
        private
        returns (uint256 gross)
    {
        uint256 donation;
        uint256 fee;
        (gross, donation, fee,) = _split(c, o.quantity);
        if (c.maxDonation != 0 && committedDonation[o.campaignId] + donation > c.maxDonation) {
            revert DonationCapReached();
        }
        committedDonation[o.campaignId] += donation;

        _payments[paymentId] = Payment({
            campaignId: o.campaignId,
            buyer: buyer,
            quantity: o.quantity,
            settleAfter: uint64(block.timestamp) + c.refundWindow,
            status: PaymentStatus.Escrowed,
            gross: gross,
            donation: donation,
            fee: fee,
            orderHash: o.orderHash
        });
    }

    function _emitPurchase(bytes32 paymentId, bytes32 productId, address token) private {
        Payment storage p = _payments[paymentId];
        emit PurchaseCompleted(
            paymentId, productId, p.campaignId, p.buyer, p.quantity, p.gross, p.donation, token, p.orderHash
        );
    }

    function _settle(bytes32 paymentId, ProductCampaign.Campaign memory c) private {
        Payment storage p = _payments[paymentId];
        p.status = PaymentStatus.Settled;

        uint256 donation = p.donation;
        uint256 fee = p.fee;
        uint256 merchantAmount = p.gross - donation - fee;
        IERC20 token = IERC20(c.paymentToken);

        if (merchantAmount > 0) token.safeTransfer(c.merchantReceiver, merchantAmount);
        if (donation > 0) token.safeTransfer(c.charityTreasury, donation);
        if (fee > 0) token.safeTransfer(platformReceiver, fee);

        emit PaymentSettled(paymentId, merchantAmount, donation, fee);
        if (donation > 0) emit DonationReceived(c.projectId, paymentId, donation, c.paymentToken);
    }
}
