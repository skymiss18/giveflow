export const USDC_DECIMALS = 6;

export const MERCHANT_STATUS = ["None", "Pending", "Approved", "Rejected", "Suspended"] as const;
export const CHARITY_STATUS = MERCHANT_STATUS;
export const CAMPAIGN_STATUS = ["Active", "Paused", "Superseded"] as const;
export const PAYMENT_STATUS = ["None", "Escrowed", "Settled", "Refunded"] as const;
export const PROJECT_STATUS = ["None", "Active", "Completed", "Closed"] as const;
export const EVIDENCE_KIND = [
  "Qualification",
  "Budget",
  "Procurement",
  "DeliveryReceipt",
  "ServiceRecord",
  "Other",
] as const;
export const EVIDENCE_STATUS = ["None", "Submitted", "Verified", "Rejected"] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUS)[number];
export type PartyStatus = (typeof MERCHANT_STATUS)[number];
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export type EvidenceStatus = (typeof EVIDENCE_STATUS)[number];

export const PROJECT_CATEGORIES = [
  "Education",
  "Healthcare",
  "Elderly care",
  "Children & youth",
  "Food & livelihood",
  "Disaster relief",
  "Environment",
  "Community",
  "Public goods",
  "Other",
] as const;

/** Standard Anvil accounts used by the local dev wallets and the seed script. */
export const DEV_ACCOUNTS = [
  { label: "Admin", address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  { label: "Merchant", address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
  { label: "Merchant payout", address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
  { label: "Charity", address: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
  { label: "Verifier", address: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" },
  { label: "Buyer", address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc" },
  { label: "Treasury signer 1", address: "0x976EA74026E726554dB657fA54763abd0C3a0aa9" },
  { label: "Treasury signer 2", address: "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955" },
  { label: "Treasury signer 3", address: "0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f" },
  { label: "Platform", address: "0xa0Ee7A142d267C1f36714E4a8F75612F20a79720" },
] as const;
