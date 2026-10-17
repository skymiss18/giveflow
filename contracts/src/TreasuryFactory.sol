// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {DonationTreasury} from "./DonationTreasury.sol";

contract TreasuryFactory {
    mapping(address => bool) public isTreasury;

    event TreasuryCreated(address indexed creator, address indexed treasury, address[] owners, uint256 threshold);

    function createTreasury(address[] calldata owners, uint256 threshold) external returns (address treasury) {
        treasury = address(new DonationTreasury(owners, threshold));
        isTreasury[treasury] = true;
        emit TreasuryCreated(msg.sender, treasury, owners, threshold);
    }
}
