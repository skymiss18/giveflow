// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract CharityRegistry is AccessControl {
    enum Status {
        None,
        Pending,
        Approved,
        Rejected,
        Suspended
    }

    enum ProjectStatus {
        None,
        Active,
        Completed,
        Closed
    }

    struct Charity {
        Status status;
        bytes32 metadataHash;
    }

    struct Project {
        address charity;
        address treasury;
        bytes32 metadataHash;
        uint256 targetAmount;
        ProjectStatus status;
    }

    uint256 public projectCount;
    mapping(address => Charity) private _charities;
    mapping(uint256 => Project) private _projects;

    event CharityApplied(address indexed wallet, bytes32 metadataHash);
    event CharityStatusChanged(address indexed wallet, Status status);
    event CharityProjectCreated(
        uint256 indexed projectId, address indexed charity, address treasury, bytes32 metadataHash, uint256 targetAmount
    );
    event ProjectStatusChanged(uint256 indexed projectId, ProjectStatus status);

    error InvalidState();
    error InvalidTreasury();
    error NotApprovedCharity();
    error NotProjectOwner();

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function applyAsCharity(bytes32 metadataHash) external {
        Charity storage c = _charities[msg.sender];
        if (c.status != Status.None && c.status != Status.Rejected) revert InvalidState();
        c.status = Status.Pending;
        c.metadataHash = metadataHash;
        emit CharityApplied(msg.sender, metadataHash);
        emit CharityStatusChanged(msg.sender, Status.Pending);
    }

    function approve(address wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Charity storage c = _charities[wallet];
        if (c.status != Status.Pending && c.status != Status.Suspended) revert InvalidState();
        c.status = Status.Approved;
        emit CharityStatusChanged(wallet, Status.Approved);
    }

    function reject(address wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Charity storage c = _charities[wallet];
        if (c.status != Status.Pending) revert InvalidState();
        c.status = Status.Rejected;
        emit CharityStatusChanged(wallet, Status.Rejected);
    }

    function suspend(address wallet) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Charity storage c = _charities[wallet];
        if (c.status != Status.Approved) revert InvalidState();
        c.status = Status.Suspended;
        emit CharityStatusChanged(wallet, Status.Suspended);
    }

    function createProject(address treasury, bytes32 metadataHash, uint256 targetAmount)
        external
        returns (uint256 projectId)
    {
        if (_charities[msg.sender].status != Status.Approved) revert NotApprovedCharity();
        if (treasury == address(0)) revert InvalidTreasury();
        projectId = ++projectCount;
        _projects[projectId] = Project(msg.sender, treasury, metadataHash, targetAmount, ProjectStatus.Active);
        emit CharityProjectCreated(projectId, msg.sender, treasury, metadataHash, targetAmount);
    }

    function setProjectStatus(uint256 projectId, ProjectStatus status) external {
        Project storage p = _projects[projectId];
        if (p.charity != msg.sender) revert NotProjectOwner();
        if (p.status != ProjectStatus.Active) revert InvalidState();
        if (status != ProjectStatus.Completed && status != ProjectStatus.Closed) revert InvalidState();
        p.status = status;
        emit ProjectStatusChanged(projectId, status);
    }

    function isApprovedCharity(address wallet) external view returns (bool) {
        return _charities[wallet].status == Status.Approved;
    }

    function isProjectActive(uint256 projectId) external view returns (bool) {
        Project storage p = _projects[projectId];
        return p.status == ProjectStatus.Active && _charities[p.charity].status == Status.Approved;
    }

    function getCharity(address wallet) external view returns (Charity memory) {
        return _charities[wallet];
    }

    function getProject(uint256 projectId) external view returns (Project memory) {
        return _projects[projectId];
    }
}
