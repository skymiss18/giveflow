// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

/// @notice Blocks new sales only; it has no authority over escrow, refunds or treasury balances.
contract PauseController is AccessControl {
    using EnumerableSet for EnumerableSet.UintSet;

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    bool public globalPaused;
    mapping(uint256 => bool) public campaignPaused;
    mapping(uint256 => bool) public projectPaused;
    EnumerableSet.UintSet private _pausedCampaigns;
    EnumerableSet.UintSet private _pausedProjects;

    event GlobalPauseChanged(bool paused, address indexed by);
    event CampaignPaused(uint256 indexed campaignId, bool paused, bytes32 reason);
    event ProjectPauseChanged(uint256 indexed projectId, bool paused, bytes32 reason);

    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function setGlobalPaused(bool paused) external onlyRole(PAUSER_ROLE) {
        globalPaused = paused;
        emit GlobalPauseChanged(paused, msg.sender);
    }

    function setCampaignPaused(uint256 campaignId, bool paused, bytes32 reason) external onlyRole(PAUSER_ROLE) {
        campaignPaused[campaignId] = paused;
        if (paused) _pausedCampaigns.add(campaignId);
        else _pausedCampaigns.remove(campaignId);
        emit CampaignPaused(campaignId, paused, reason);
    }

    function setProjectPaused(uint256 projectId, bool paused, bytes32 reason) external onlyRole(PAUSER_ROLE) {
        projectPaused[projectId] = paused;
        if (paused) _pausedProjects.add(projectId);
        else _pausedProjects.remove(projectId);
        emit ProjectPauseChanged(projectId, paused, reason);
    }

    function isSaleBlocked(uint256 campaignId, uint256 projectId) external view returns (bool) {
        return globalPaused || campaignPaused[campaignId] || projectPaused[projectId];
    }

    function pausedCampaignCount() external view returns (uint256) {
        return _pausedCampaigns.length();
    }

    function pausedCampaignAt(uint256 index) external view returns (uint256) {
        return _pausedCampaigns.at(index);
    }

    function pausedProjectCount() external view returns (uint256) {
        return _pausedProjects.length();
    }

    function pausedProjectAt(uint256 index) external view returns (uint256) {
        return _pausedProjects.at(index);
    }
}
