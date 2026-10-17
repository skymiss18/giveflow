// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {CharityRegistry} from "./CharityRegistry.sol";
import {EvidenceRegistry} from "./EvidenceRegistry.sol";

contract ImpactReportRegistry is AccessControl {
    struct Report {
        bytes32 reportHash;
        uint32 version;
        uint64 publishedAt;
        address publisher;
    }

    CharityRegistry public immutable charities;
    EvidenceRegistry public immutable evidence;

    mapping(uint256 => Report[]) private _reports;

    event ImpactReportPublished(uint256 indexed projectId, bytes32 reportHash, uint32 version, string uri);

    error NotAuthorized();
    error EmptyHash();
    error NoVerifiedEvidence();

    constructor(address admin, CharityRegistry charities_, EvidenceRegistry evidence_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        charities = charities_;
        evidence = evidence_;
    }

    /// @notice Only the project's charity or the admin may publish, and only once evidence has been verified.
    function publishReport(uint256 projectId, bytes32 reportHash, string calldata uri) external returns (uint32 version) {
        address charity = charities.getProject(projectId).charity;
        if (msg.sender != charity && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) revert NotAuthorized();
        if (charity == address(0)) revert NotAuthorized();
        if (reportHash == bytes32(0)) revert EmptyHash();
        if (evidence.verifiedCount(projectId) == 0) revert NoVerifiedEvidence();

        Report[] storage list = _reports[projectId];
        version = uint32(list.length + 1);
        list.push(Report(reportHash, version, uint64(block.timestamp), msg.sender));
        emit ImpactReportPublished(projectId, reportHash, version, uri);
    }

    function reportCount(uint256 projectId) external view returns (uint256) {
        return _reports[projectId].length;
    }

    function reportAt(uint256 projectId, uint256 index) external view returns (Report memory) {
        return _reports[projectId][index];
    }

    function latestReport(uint256 projectId) external view returns (Report memory) {
        Report[] storage list = _reports[projectId];
        return list[list.length - 1];
    }
}
