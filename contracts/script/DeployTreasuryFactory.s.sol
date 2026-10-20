// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {TreasuryFactory} from "../src/TreasuryFactory.sol";

contract DeployTreasuryFactory is Script {
    function run() external {
        string memory path = string.concat("./deployments/", vm.toString(block.chainid), ".json");
        string memory previous = vm.readFile(path);

        uint256 deployerKey = uint256(vm.envOr("DEPLOYER_PRIVATE_KEY", bytes32(0)));
        if (deployerKey != 0) vm.startBroadcast(deployerKey);
        else vm.startBroadcast();
        TreasuryFactory factory = new TreasuryFactory();
        vm.stopBroadcast();

        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", vm.parseJsonUint(previous, ".chainId"));
        vm.serializeUint(k, "deployBlock", vm.parseJsonUint(previous, ".deployBlock"));
        vm.serializeAddress(k, "admin", vm.parseJsonAddress(previous, ".admin"));
        vm.serializeAddress(k, "platformReceiver", vm.parseJsonAddress(previous, ".platformReceiver"));
        vm.serializeAddress(k, "MockUSDC", vm.parseJsonAddress(previous, ".MockUSDC"));
        vm.serializeAddress(k, "MerchantRegistry", vm.parseJsonAddress(previous, ".MerchantRegistry"));
        vm.serializeAddress(k, "CharityRegistry", vm.parseJsonAddress(previous, ".CharityRegistry"));
        vm.serializeAddress(k, "PauseController", vm.parseJsonAddress(previous, ".PauseController"));
        vm.serializeAddress(k, "ProductCampaign", vm.parseJsonAddress(previous, ".ProductCampaign"));
        vm.serializeAddress(k, "EvidenceRegistry", vm.parseJsonAddress(previous, ".EvidenceRegistry"));
        vm.serializeAddress(k, "ImpactReportRegistry", vm.parseJsonAddress(previous, ".ImpactReportRegistry"));
        vm.serializeAddress(k, "TreasuryFactory", address(factory));
        string memory json = vm.serializeAddress(k, "CheckoutRouter", vm.parseJsonAddress(previous, ".CheckoutRouter"));
        vm.writeJson(json, path);

        console.log("TreasuryFactory", address(factory));
    }
}