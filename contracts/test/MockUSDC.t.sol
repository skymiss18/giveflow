// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC internal usdc = new MockUSDC();

    function test_faucetMintsUpToCap() public {
        usdc.faucet(address(this), 1_000e6);
        assertEq(usdc.balanceOf(address(this)), 1_000e6);
        assertEq(usdc.decimals(), 6);
    }

    function test_revert_faucetAboveCap() public {
        vm.expectRevert(MockUSDC.FaucetCapExceeded.selector);
        usdc.faucet(address(this), 1_000e6 + 1);
    }
}
