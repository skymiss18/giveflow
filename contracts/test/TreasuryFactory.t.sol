// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DonationTreasury} from "../src/DonationTreasury.sol";
import {TreasuryFactory} from "../src/TreasuryFactory.sol";

contract TreasuryFactoryTest is Test {
    TreasuryFactory private factory;
    address private creator = makeAddr("creator");
    address private owner1 = makeAddr("owner1");
    address private owner2 = makeAddr("owner2");

    function setUp() public {
        factory = new TreasuryFactory();
    }

    function testTreasuryIsListedForCreatorAndAllOwners() public {
        address[] memory owners = new address[](2);
        owners[0] = owner1;
        owners[1] = owner2;

        vm.prank(creator);
        address treasury = factory.createTreasury(owners, 2);

        assertEq(factory.treasuriesFor(creator).length, 1);
        assertEq(factory.treasuriesFor(creator)[0], treasury);
        assertEq(factory.treasuriesFor(owner1)[0], treasury);
        assertEq(factory.treasuriesFor(owner2)[0], treasury);
    }

    function testCreatorWhoIsAlsoOwnerIsListedOnlyOnce() public {
        address[] memory owners = new address[](1);
        owners[0] = creator;

        vm.prank(creator);
        address treasury = factory.createTreasury(owners, 1);

        assertEq(factory.treasuriesFor(creator).length, 1);
        assertEq(factory.treasuriesFor(creator)[0], treasury);
    }

    function testExistingTreasuryCanBeRegisteredByAnOwner() public {
        address[] memory owners = new address[](2);
        owners[0] = owner1;
        owners[1] = owner2;
        DonationTreasury existing = new DonationTreasury(owners, 2);

        vm.prank(owner1);
        factory.registerExistingTreasury(address(existing));

        assertEq(factory.treasuriesFor(owner1)[0], address(existing));
        assertEq(factory.treasuriesFor(owner2)[0], address(existing));
    }
}