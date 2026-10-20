// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DonationTreasury} from "./DonationTreasury.sol";

contract TreasuryFactory {
    mapping(address => bool) public isTreasury;
    mapping(address => address[]) private _treasuriesByOwner;
    mapping(address => mapping(address => bool)) private _listedForOwner;

    event TreasuryCreated(address indexed creator, address indexed treasury, address[] owners, uint256 threshold);
    event TreasuryRegistered(address indexed caller, address indexed treasury);

    error NotTreasuryOwner();

    function createTreasury(address[] calldata owners, uint256 threshold) external returns (address treasury) {
        treasury = address(new DonationTreasury(owners, threshold));
        isTreasury[treasury] = true;
        _registerFor(msg.sender, treasury);
        for (uint256 i; i < owners.length; i++) {
            _registerFor(owners[i], treasury);
        }
        emit TreasuryCreated(msg.sender, treasury, owners, threshold);
    }

    function treasuriesFor(address owner) external view returns (address[] memory) {
        return _treasuriesByOwner[owner];
    }

    function registerExistingTreasury(address treasury) external {
        if (treasury.code.length == 0 || !DonationTreasury(treasury).isOwner(msg.sender)) revert NotTreasuryOwner();

        address[] memory owners = DonationTreasury(treasury).owners();
        isTreasury[treasury] = true;
        _registerFor(msg.sender, treasury);
        for (uint256 i; i < owners.length; i++) {
            _registerFor(owners[i], treasury);
        }
        emit TreasuryRegistered(msg.sender, treasury);
    }

    function _registerFor(address owner, address treasury) private {
        if (_listedForOwner[owner][treasury]) return;
        _listedForOwner[owner][treasury] = true;
        _treasuriesByOwner[owner].push(treasury);
    }
}
