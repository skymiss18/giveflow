import type {
  CampaignStatus,
  EVIDENCE_KIND,
  EvidenceStatus,
  PartyStatus,
  PaymentStatus,
  ProjectStatus,
} from "./constants";
import type { CharityProfileMeta, MerchantProfileMeta, ProductMeta, ProjectMeta } from "./metadata";

export type Hex = `0x${string}`;

export type CampaignView = {
  campaignId: string;
  productId: Hex;
  merchant: Hex;
  merchantName: string | null;
  merchantReceiver: Hex;
  projectId: string;
  projectTitle: string | null;
  charityTreasury: Hex;
  paymentToken: Hex;
  unitPrice: string;
  fixedDonationAmount: string;
  percentageDonationBps: number;
  serviceFeeBps: number;
  maxDonation: string;
  saleStart: number;
  saleEnd: number;
  refundWindow: number;
  ruleVersion: number;
  status: CampaignStatus;
  isLatest: boolean;
  metadataHash: Hex;
  meta: ProductMeta | null;
  stats: { units: number; orders: number; gross: string; donated: string };
  txHash: Hex | null;
};

export type OrderView = {
  paymentId: Hex;
  productId: Hex;
  productName: string | null;
  campaignId: string;
  projectId: string;
  projectTitle: string | null;
  merchant: Hex;
  buyer: Hex;
  quantity: number;
  gross: string;
  donation: string;
  fee: string;
  token: Hex;
  orderHash: Hex;
  status: PaymentStatus;
  txHash: Hex;
  timestamp: number;
  settleAfter: number;
  settleTxHash: Hex | null;
  refundTxHash: Hex | null;
};

export type PartyView = {
  wallet: Hex;
  kind: "merchant" | "charity";
  status: PartyStatus;
  metadataHash: Hex;
  receiver: Hex | null;
  meta: MerchantProfileMeta | CharityProfileMeta | null;
  appliedAt: number;
};

export type EvidenceView = {
  evidenceId: string;
  projectId: string;
  contentHash: Hex;
  kind: (typeof EVIDENCE_KIND)[number];
  status: EvidenceStatus;
  submitter: Hex;
  verifier: Hex | null;
  submittedAt: number;
  verifiedAt: number;
  noteHash: Hex | null;
  storageRef: string;
  txHash: Hex;
  file: { name: string; mime: string; size: number } | null;
};

export type ProposalView = {
  proposalId: string;
  token: Hex;
  to: Hex;
  amount: string;
  purposeHash: Hex;
  approvals: number;
  executed: boolean;
  approvedBy: Hex[];
};

export type TreasuryView = {
  address: Hex;
  owners: Hex[];
  threshold: number;
  balance: string;
  proposals: ProposalView[];
  projectIds: string[];
};

export type ReportRef = {
  version: number;
  reportHash: Hex;
  publishedAt: number;
  uri: string;
};

export type ProjectView = {
  projectId: string;
  charity: Hex;
  charityName: string | null;
  treasury: Hex;
  metadataHash: Hex;
  targetAmount: string;
  status: ProjectStatus;
  meta: ProjectMeta | null;
  received: string;
  pending: string;
  orders: number;
  treasuryBalance: string;
  evidence: { submitted: number; verified: number; rejected: number };
  latestReport: ReportRef | null;
};

export type ProjectDetail = ProjectView & {
  evidenceList: EvidenceView[];
  orderList: OrderView[];
  reports: ReportRef[];
};

export type ReportSnapshot = {
  schema: "shanliu-visible/impact-report@1";
  chainId: number;
  projectId: string;
  generatedAt: number;
  project: {
    title: string;
    category: string;
    charity: Hex;
    charityName: string | null;
    treasury: Hex;
    targetAmount: string;
    status: ProjectStatus;
  };
  totals: {
    orders: number;
    units: number;
    gross: string;
    donationsSettled: string;
    donationsPending: string;
    donationsRefunded: string;
    disbursed: string;
    treasuryBalance: string;
  };
  orders: {
    paymentId: Hex;
    txHash: Hex;
    campaignId: string;
    productName: string | null;
    quantity: number;
    gross: string;
    donation: string;
    status: PaymentStatus;
    timestamp: number;
  }[];
  evidence: {
    evidenceId: string;
    kind: string;
    contentHash: Hex;
    status: EvidenceStatus;
    verifier: Hex | null;
    submittedAt: number;
    verifiedAt: number;
    txHash: Hex;
  }[];
  disbursements: { proposalId: string; to: Hex; amount: string; purposeHash: Hex; executed: boolean }[];
};

export type PublishedReport = {
  ref: ReportRef;
  snapshot: ReportSnapshot | null;
  hashMatches: boolean;
};

export type AdminOverview = {
  admin: Hex;
  platformReceiver: Hex;
  serviceFeeBps: number;
  globalPaused: boolean;
  tokenAllowed: boolean;
  verifiers: Hex[];
  pausedCampaigns: string[];
  pausedProjects: string[];
};

export type Stats = {
  orders: number;
  donated: string;
  projects: number;
  merchants: number;
  verifiedEvidence: number;
  totalEvidence: number;
};
