// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice M-of-N ERC-20 treasury. No single owner can move funds.
contract DonationTreasury is ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Proposal {
        address token;
        address to;
        uint256 amount;
        bytes32 purposeHash;
        uint32 approvals;
        bool executed;
    }

    uint256 public immutable threshold;
    address[] private _owners;
    mapping(address => bool) public isOwner;
    uint256 public proposalCount;
    mapping(uint256 => Proposal) private _proposals;
    mapping(uint256 => mapping(address => bool)) public approvedBy;

    event ProposalSubmitted(
        uint256 indexed proposalId, address indexed proposer, address token, address to, uint256 amount, bytes32 purposeHash
    );
    event ProposalApproved(uint256 indexed proposalId, address indexed owner);
    event ProposalRevoked(uint256 indexed proposalId, address indexed owner);
    event ProposalExecuted(uint256 indexed proposalId, address indexed executor);

    error InvalidOwners();
    error InvalidThreshold();
    error NotOwner();
    error UnknownProposal();
    error AlreadyExecuted();
    error AlreadyApproved();
    error NotApproved();
    error ThresholdNotMet();
    error InvalidTransfer();

    modifier onlyOwner() {
        if (!isOwner[msg.sender]) revert NotOwner();
        _;
    }

    constructor(address[] memory owners_, uint256 threshold_) {
        uint256 n = owners_.length;
        if (n == 0) revert InvalidOwners();
        if (threshold_ == 0 || threshold_ > n) revert InvalidThreshold();
        for (uint256 i = 0; i < n; i++) {
            address o = owners_[i];
            if (o == address(0) || isOwner[o]) revert InvalidOwners();
            isOwner[o] = true;
            _owners.push(o);
        }
        threshold = threshold_;
    }

    function submit(address token, address to, uint256 amount, bytes32 purposeHash)
        external
        onlyOwner
        returns (uint256 proposalId)
    {
        if (token == address(0) || to == address(0) || amount == 0) revert InvalidTransfer();
        proposalId = ++proposalCount;
        _proposals[proposalId] = Proposal(token, to, amount, purposeHash, 0, false);
        emit ProposalSubmitted(proposalId, msg.sender, token, to, amount, purposeHash);
        _approve(proposalId);
    }

    function approve(uint256 proposalId) external onlyOwner {
        _approve(proposalId);
    }

    function revoke(uint256 proposalId) external onlyOwner {
        Proposal storage p = _proposals[proposalId];
        if (p.executed) revert AlreadyExecuted();
        if (!approvedBy[proposalId][msg.sender]) revert NotApproved();
        approvedBy[proposalId][msg.sender] = false;
        p.approvals--;
        emit ProposalRevoked(proposalId, msg.sender);
    }

    function execute(uint256 proposalId) external onlyOwner nonReentrant {
        Proposal storage p = _proposals[proposalId];
        if (p.token == address(0)) revert UnknownProposal();
        if (p.executed) revert AlreadyExecuted();
        if (p.approvals < threshold) revert ThresholdNotMet();
        p.executed = true;
        IERC20(p.token).safeTransfer(p.to, p.amount);
        emit ProposalExecuted(proposalId, msg.sender);
    }

    function owners() external view returns (address[] memory) {
        return _owners;
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        return _proposals[proposalId];
    }

    function _approve(uint256 proposalId) private {
        Proposal storage p = _proposals[proposalId];
        if (p.token == address(0)) revert UnknownProposal();
        if (p.executed) revert AlreadyExecuted();
        if (approvedBy[proposalId][msg.sender]) revert AlreadyApproved();
        approvedBy[proposalId][msg.sender] = true;
        p.approvals++;
        emit ProposalApproved(proposalId, msg.sender);
    }
}
