// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract MerchantRegistry is AccessControl {
    enum Status {
        None,
        Pending,
        Approved,
        Rejected,
        Suspended
    }

    struct Merchant {
        Status status;
        address receiver;
        bytes32 metadataHash;
        uint64 appliedAt;
    }

    mapping(address => Merchant) private _merchants;
    address[] private _applicants;

    event MerchantApplied(address indexed wallet, address receiver, bytes32 metadataHash);
    event MerchantApproved(address indexed wallet, address receiver, bytes32 metadataHash);
    event MerchantStatusChanged(address indexed wallet, Status status);

    error InvalidReceiver();
    error InvalidState();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function applyAsMerchant(address receiver, bytes32 metadataHash) external {
        if (receiver == address(0)) revert InvalidReceiver();
        Merchant storage m = _merchants[msg.sender];
        if (m.status != Status.None && m.status != Status.Rejected) revert InvalidState();
        if (m.status == Status.None) _applicants.push(msg.sender);
        m.status = Status.Pending;
        m.receiver = receiver;
        m.metadataHash = metadataHash;
        m.appliedAt = uint64(block.timestamp);
        emit MerchantApplied(msg.sender, receiver, metadataHash);
        emit MerchantStatusChanged(msg.sender, Status.Pending);
    }

    function approve(address wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Merchant storage m = _merchants[wallet];
        if (m.status != Status.Pending && m.status != Status.Suspended) revert InvalidState();
        m.status = Status.Approved;
        emit MerchantApproved(wallet, m.receiver, m.metadataHash);
        emit MerchantStatusChanged(wallet, Status.Approved);
    }

    function reject(address wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Merchant storage m = _merchants[wallet];
        if (m.status != Status.Pending) revert InvalidState();
        m.status = Status.Rejected;
        emit MerchantStatusChanged(wallet, Status.Rejected);
    }

    function suspend(address wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Merchant storage m = _merchants[wallet];
        if (m.status != Status.Approved) revert InvalidState();
        m.status = Status.Suspended;
        emit MerchantStatusChanged(wallet, Status.Suspended);
    }

    function isApproved(address wallet) external view returns (bool) {
        return _merchants[wallet].status == Status.Approved;
    }

    function getMerchant(address wallet) external view returns (Merchant memory) {
        return _merchants[wallet];
    }

    function applicantCount() external view returns (uint256) {
        return _applicants.length;
    }

    /// @notice Wallets in first-application order; returns fewer than `limit` entries at the end of the list.
    function getApplicants(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = _applicants.length;
        if (offset >= total) return page;
        uint256 n = total - offset;
        if (limit < n) n = limit;
        page = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            page[i] = _applicants[offset + i];
        }
    }
}
