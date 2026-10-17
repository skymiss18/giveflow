// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {MerchantRegistry} from "./MerchantRegistry.sol";
import {CharityRegistry} from "./CharityRegistry.sol";

contract ProductCampaign is AccessControl {
    enum Status {
        Active,
        Paused,
        Superseded
    }

    struct Campaign {
        bytes32 productId;
        address merchant;
        address merchantReceiver;
        uint256 projectId;
        address charityTreasury;
        address paymentToken;
        uint256 unitPrice;
        uint256 fixedDonationAmount;
        uint256 maxDonation;
        uint64 saleStart;
        uint64 saleEnd;
        uint64 refundWindow;
        uint32 ruleVersion;
        uint16 percentageDonationBps;
        uint16 serviceFeeBps;
        Status status;
        bytes32 metadataHash;
    }

    struct NewCampaign {
        bytes32 productId;
        uint256 projectId;
        address paymentToken;
        uint256 unitPrice;
        uint256 fixedDonationAmount;
        uint16 percentageDonationBps;
        uint64 saleStart;
        uint64 saleEnd;
        uint64 refundWindow;
        uint256 maxDonation;
        bytes32 metadataHash;
    }

    uint16 public constant BPS = 10_000;
    uint16 public constant MAX_FEE_BPS = 1_000;
    uint64 public constant MAX_REFUND_WINDOW = 30 days;

    MerchantRegistry public immutable merchants;
    CharityRegistry public immutable charities;

    uint16 public defaultServiceFeeBps;
    uint256 public campaignCount;
    mapping(address => bool) public allowedToken;
    mapping(bytes32 => uint256) public latestCampaignOf;
    mapping(bytes32 => address) public productMerchant;
    mapping(uint256 => Campaign) private _campaigns;

    event CampaignPublished(
        uint256 indexed campaignId,
        bytes32 indexed productId,
        address indexed merchant,
        uint256 projectId,
        uint32 ruleVersion,
        bytes32 ruleHash
    );
    event CampaignStatusChanged(uint256 indexed campaignId, Status status);
    event TokenAllowed(address indexed token, bool allowed);
    event ServiceFeeChanged(uint16 bps);

    error NotApprovedMerchant();
    error NotProductOwner();
    error ProjectNotActive();
    error TokenNotAllowed();
    error InvalidPrice();
    error InvalidDonationRule();
    error InvalidSaleWindow();
    error InvalidRefundWindow();
    error FeeTooHigh();
    error InvalidState();

    constructor(address admin, MerchantRegistry merchants_, CharityRegistry charities_, uint16 serviceFeeBps) {
        if (serviceFeeBps > MAX_FEE_BPS) revert FeeTooHigh();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        merchants = merchants_;
        charities = charities_;
        defaultServiceFeeBps = serviceFeeBps;
    }

    function setAllowedToken(address token, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        allowedToken[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    function setDefaultServiceFeeBps(uint16 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps > MAX_FEE_BPS) revert FeeTooHigh();
        defaultServiceFeeBps = bps;
        emit ServiceFeeChanged(bps);
    }

    /// @notice Publishing for an existing productId creates a new rule version and supersedes the previous one.
    function createCampaign(NewCampaign calldata p) external returns (uint256 campaignId) {
        if (!merchants.isApproved(msg.sender)) revert NotApprovedMerchant();
        address owner_ = productMerchant[p.productId];
        if (owner_ != address(0) && owner_ != msg.sender) revert NotProductOwner();
        if (!charities.isProjectActive(p.projectId)) revert ProjectNotActive();
        if (!allowedToken[p.paymentToken]) revert TokenNotAllowed();
        if (p.unitPrice == 0) revert InvalidPrice();
        if (p.saleEnd <= p.saleStart || p.saleEnd <= block.timestamp) revert InvalidSaleWindow();
        if (p.refundWindow > MAX_REFUND_WINDOW) revert InvalidRefundWindow();

        uint16 fee = defaultServiceFeeBps;
        if ((p.fixedDonationAmount > 0) == (p.percentageDonationBps > 0)) revert InvalidDonationRule();
        if (p.fixedDonationAmount > 0) {
            if (p.fixedDonationAmount * BPS + p.unitPrice * fee > p.unitPrice * BPS) revert InvalidDonationRule();
        } else if (uint256(p.percentageDonationBps) + fee > BPS) {
            revert InvalidDonationRule();
        }

        uint256 prevId = latestCampaignOf[p.productId];
        uint32 version = 1;
        if (prevId != 0) {
            Campaign storage prev = _campaigns[prevId];
            prev.status = Status.Superseded;
            version = prev.ruleVersion + 1;
            emit CampaignStatusChanged(prevId, Status.Superseded);
        }

        campaignId = ++campaignCount;
        Campaign memory c = Campaign({
            productId: p.productId,
            merchant: msg.sender,
            merchantReceiver: merchants.getMerchant(msg.sender).receiver,
            projectId: p.projectId,
            charityTreasury: charities.getProject(p.projectId).treasury,
            paymentToken: p.paymentToken,
            unitPrice: p.unitPrice,
            fixedDonationAmount: p.fixedDonationAmount,
            maxDonation: p.maxDonation,
            saleStart: p.saleStart,
            saleEnd: p.saleEnd,
            refundWindow: p.refundWindow,
            ruleVersion: version,
            percentageDonationBps: p.percentageDonationBps,
            serviceFeeBps: fee,
            status: Status.Active,
            metadataHash: p.metadataHash
        });
        _campaigns[campaignId] = c;
        productMerchant[p.productId] = msg.sender;
        latestCampaignOf[p.productId] = campaignId;

        emit CampaignPublished(campaignId, p.productId, msg.sender, p.projectId, version, keccak256(abi.encode(c)));
    }

    function setPaused(uint256 campaignId, bool paused) external {
        Campaign storage c = _campaigns[campaignId];
        if (c.merchant != msg.sender) revert NotProductOwner();
        if (c.status == Status.Superseded) revert InvalidState();
        c.status = paused ? Status.Paused : Status.Active;
        emit CampaignStatusChanged(campaignId, c.status);
    }

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return _campaigns[campaignId];
    }
}
