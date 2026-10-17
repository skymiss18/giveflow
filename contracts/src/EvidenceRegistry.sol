// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {CharityRegistry} from "./CharityRegistry.sol";

/// @notice Stores content hashes only; files and any beneficiary data stay off-chain.
contract EvidenceRegistry is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    enum Kind {
        Qualification,
        Budget,
        Procurement,
        DeliveryReceipt,
        ServiceRecord,
        Other
    }

    enum Status {
        None,
        Submitted,
        Verified,
        Rejected
    }

    struct Evidence {
        uint256 projectId;
        bytes32 contentHash;
        Kind kind;
        Status status;
        address submitter;
        address verifier;
        uint64 submittedAt;
        uint64 verifiedAt;
        bytes32 noteHash;
    }

    CharityRegistry public immutable charities;

    uint256 public evidenceCount;
    mapping(uint256 => Evidence) private _evidence;
    mapping(bytes32 => uint256) public evidenceIdByHash;
    mapping(uint256 => uint256) public submittedCount;
    mapping(uint256 => uint256) public verifiedCount;

    event EvidenceSubmitted(
        uint256 indexed evidenceId,
        uint256 indexed projectId,
        bytes32 evidenceHash,
        address indexed submitter,
        Kind kind,
        string storageRef
    );
    event EvidenceVerified(uint256 indexed evidenceId, address indexed verifier, Status result, bytes32 noteHash);

    error NotProjectCharity();
    error EmptyHash();
    error DuplicateEvidence();
    error NotPending();
    error SelfVerification();

    constructor(address admin, CharityRegistry charities_) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        charities = charities_;
    }

    function submitEvidence(uint256 projectId, Kind kind, bytes32 contentHash, string calldata storageRef)
        external
        returns (uint256 evidenceId)
    {
        if (charities.getProject(projectId).charity != msg.sender || !charities.isApprovedCharity(msg.sender)) {
            revert NotProjectCharity();
        }
        if (contentHash == bytes32(0)) revert EmptyHash();
        if (evidenceIdByHash[contentHash] != 0) revert DuplicateEvidence();

        evidenceId = ++evidenceCount;
        _evidence[evidenceId] = Evidence({
            projectId: projectId,
            contentHash: contentHash,
            kind: kind,
            status: Status.Submitted,
            submitter: msg.sender,
            verifier: address(0),
            submittedAt: uint64(block.timestamp),
            verifiedAt: 0,
            noteHash: bytes32(0)
        });
        evidenceIdByHash[contentHash] = evidenceId;
        submittedCount[projectId]++;
        emit EvidenceSubmitted(evidenceId, projectId, contentHash, msg.sender, kind, storageRef);
    }

    function verifyEvidence(uint256 evidenceId, bool approved, bytes32 noteHash) external onlyRole(VERIFIER_ROLE) {
        Evidence storage e = _evidence[evidenceId];
        if (e.status != Status.Submitted) revert NotPending();
        if (e.submitter == msg.sender) revert SelfVerification();

        e.status = approved ? Status.Verified : Status.Rejected;
        e.verifier = msg.sender;
        e.verifiedAt = uint64(block.timestamp);
        e.noteHash = noteHash;
        if (approved) verifiedCount[e.projectId]++;
        emit EvidenceVerified(evidenceId, msg.sender, e.status, noteHash);
    }

    function getEvidence(uint256 evidenceId) external view returns (Evidence memory) {
        return _evidence[evidenceId];
    }
}
