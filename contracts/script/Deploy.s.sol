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
import {EvidenceRegistry} from "../src/EvidenceRegistry.sol";
import {ImpactReportRegistry} from "../src/ImpactReportRegistry.sol";
import {TreasuryFactory} from "../src/TreasuryFactory.sol";

/// @notice Deploys the full stack. The broadcaster becomes admin of every contract.
/// Env (optional): DEPLOYER_PRIVATE_KEY (else the CLI wallet is used), PLATFORM_RECEIVER (defaults to admin), SERVICE_FEE_BPS (defaults to 200).
contract Deploy is Script {
    function run() external {
        uint16 feeBps = uint16(vm.envOr("SERVICE_FEE_BPS", uint256(200)));

        uint256 deployerKey = uint256(vm.envOr("DEPLOYER_PRIVATE_KEY", bytes32(0)));
        if (deployerKey != 0) vm.startBroadcast(deployerKey);
        else vm.startBroadcast();
        (, address admin,) = vm.readCallers();
        address platformReceiver = vm.envOr("PLATFORM_RECEIVER", admin);

        MockUSDC usdc = new MockUSDC();
        MerchantRegistry merchants = new MerchantRegistry(admin);
        CharityRegistry charities = new CharityRegistry(admin);
        PauseController pauser = new PauseController(admin);
        ProductCampaign campaigns = new ProductCampaign(admin, merchants, charities, feeBps);
        CheckoutRouter router = new CheckoutRouter(admin, campaigns, pauser, platformReceiver);
        EvidenceRegistry evidence = new EvidenceRegistry(admin, charities);
        ImpactReportRegistry reports = new ImpactReportRegistry(admin, charities, evidence);
        TreasuryFactory factory = new TreasuryFactory();

        campaigns.setAllowedToken(address(usdc), true);
        vm.stopBroadcast();

        console.log("admin", admin);
        console.log("MockUSDC", address(usdc));
        console.log("CheckoutRouter", address(router));

        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return;

        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeAddress(k, "admin", admin);
        vm.serializeAddress(k, "platformReceiver", platformReceiver);
        vm.serializeAddress(k, "MockUSDC", address(usdc));
        vm.serializeAddress(k, "MerchantRegistry", address(merchants));
        vm.serializeAddress(k, "CharityRegistry", address(charities));
        vm.serializeAddress(k, "PauseController", address(pauser));
        vm.serializeAddress(k, "ProductCampaign", address(campaigns));
        vm.serializeAddress(k, "EvidenceRegistry", address(evidence));
        vm.serializeAddress(k, "ImpactReportRegistry", address(reports));
        vm.serializeAddress(k, "TreasuryFactory", address(factory));
        string memory json = vm.serializeAddress(k, "CheckoutRouter", address(router));
        vm.writeJson(json, string.concat("./deployments/", vm.toString(block.chainid), ".json"));
    }
}
