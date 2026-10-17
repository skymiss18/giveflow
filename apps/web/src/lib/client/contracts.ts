import {
  charityRegistryAbi,
  checkoutRouterAbi,
  evidenceRegistryAbi,
  impactReportRegistryAbi,
  merchantRegistryAbi,
  mockUSDCAbi,
  pauseControllerAbi,
  productCampaignAbi,
  treasuryFactoryAbi,
} from "@/contracts/abis";
import { getDeployment } from "@/lib/shared/chain";

/** Address + ABI pairs ready to spread into read/write calls. */
export function contracts() {
  const d = getDeployment();
  return {
    deployment: d,
    usdc: { address: d.MockUSDC, abi: mockUSDCAbi },
    merchants: { address: d.MerchantRegistry, abi: merchantRegistryAbi },
    charities: { address: d.CharityRegistry, abi: charityRegistryAbi },
    campaigns: { address: d.ProductCampaign, abi: productCampaignAbi },
    router: { address: d.CheckoutRouter, abi: checkoutRouterAbi },
    evidence: { address: d.EvidenceRegistry, abi: evidenceRegistryAbi },
    reports: { address: d.ImpactReportRegistry, abi: impactReportRegistryAbi },
    factory: { address: d.TreasuryFactory, abi: treasuryFactoryAbi },
    pause: { address: d.PauseController, abi: pauseControllerAbi },
  } as const;
}

export { donationTreasuryAbi } from "@/contracts/abis";
