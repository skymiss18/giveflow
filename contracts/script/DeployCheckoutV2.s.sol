// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {MockUSDC} from "../src/MockUSDC.sol";
import {MerchantRegistry} from "../src/MerchantRegistry.sol";
import {CharityRegistry} from "../src/CharityRegistry.sol";
import {PauseController} from "../src/PauseController.sol";
import {ProductCampaign} from "../src/ProductCampaign.sol";
import {CheckoutRouter} from "../src/CheckoutRouter.sol";

contract DeployCheckoutV2 is Script {
    function run() external {
        uint256 deployerKey = uint256(vm.envOr("DEPLOYER_PRIVATE_KEY", bytes32(0)));
        if (deployerKey != 0) vm.startBroadcast(deployerKey);
        else vm.startBroadcast();
        (, address admin,) = vm.readCallers();

        string memory path = string.concat("./deployments/", vm.toString(block.chainid), ".json");
        string memory previous = vm.readFile(path);
        MerchantRegistry merchants = MerchantRegistry(vm.parseJsonAddress(previous, ".MerchantRegistry"));
        CharityRegistry charities = CharityRegistry(vm.parseJsonAddress(previous, ".CharityRegistry"));
        PauseController pauser = PauseController(vm.parseJsonAddress(previous, ".PauseController"));
        if (!merchants.hasRole(merchants.DEFAULT_ADMIN_ROLE(), admin) ||
            !charities.hasRole(charities.DEFAULT_ADMIN_ROLE(), admin) ||
            !pauser.hasRole(pauser.DEFAULT_ADMIN_ROLE(), admin)) revert("Deployer is not the current admin");

        uint16 feeBps = ProductCampaign(vm.parseJsonAddress(previous, ".ProductCampaign")).defaultServiceFeeBps();
        address platformReceiver = vm.parseJsonAddress(previous, ".platformReceiver");
        MockUSDC usdc = new MockUSDC();
        ProductCampaign campaigns = new ProductCampaign(admin, merchants, charities, feeBps);
        CheckoutRouter router = new CheckoutRouter(admin, campaigns, pauser, platformReceiver);
        campaigns.setAllowedToken(address(usdc), true);
        vm.stopBroadcast();

        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        // Reused registries emitted events before this deploy, so the indexer must keep scanning from the first deploy.
        vm.serializeUint(k, "deployBlock", vm.parseJsonUint(previous, ".deployBlock"));
        vm.serializeAddress(k, "admin", admin);
        vm.serializeAddress(k, "platformReceiver", platformReceiver);
        vm.serializeAddress(k, "MockUSDC", address(usdc));
        vm.serializeAddress(k, "MerchantRegistry", address(merchants));
        vm.serializeAddress(k, "CharityRegistry", address(charities));
        vm.serializeAddress(k, "PauseController", address(pauser));
        vm.serializeAddress(k, "ProductCampaign", address(campaigns));
        vm.serializeAddress(k, "EvidenceRegistry", vm.parseJsonAddress(previous, ".EvidenceRegistry"));
        vm.serializeAddress(k, "ImpactReportRegistry", vm.parseJsonAddress(previous, ".ImpactReportRegistry"));
        vm.serializeAddress(k, "TreasuryFactory", vm.parseJsonAddress(previous, ".TreasuryFactory"));
        string memory json = vm.serializeAddress(k, "CheckoutRouter", address(router));
        vm.writeJson(json, path);
        console.log("MockUSDC", address(usdc));
        console.log("ProductCampaign", address(campaigns));
        console.log("CheckoutRouter", address(router));
    }
}