import { keccak256, toBytes } from "viem";
import {
  charityRegistryAbi,
  checkoutRouterAbi,
  donationTreasuryAbi,
  evidenceRegistryAbi,
  impactReportRegistryAbi,
  merchantRegistryAbi,
  mockUSDCAbi,
  pauseControllerAbi,
  productCampaignAbi,
  treasuryFactoryAbi,
} from "@/contracts/abis";
import {
  CAMPAIGN_STATUS,
  CHARITY_STATUS,
  EVIDENCE_KIND,
  EVIDENCE_STATUS,
  MERCHANT_STATUS,
  PAYMENT_STATUS,
  PROJECT_STATUS,
} from "@/lib/shared/constants";
import { getDeployment } from "@/lib/shared/chain";
import { canonicalize } from "@/lib/shared/metadata";
import type { CharityProfileMeta, MerchantProfileMeta, ProductMeta, ProjectMeta } from "@/lib/shared/metadata";
import type {
  AdminOverview,
  CampaignView,
  EvidenceView,
  Hex,
  OrderView,
  PartyView,
  ProjectDetail,
  ProjectView,
  PublishedReport,
  ReportRef,
  ReportSnapshot,
  Stats,
  TreasuryView,
} from "@/lib/shared/types";
import { CHAIN_ID, publicClient } from "./chain";
import { getDb } from "./db";

const ZERO = "0x0000000000000000000000000000000000000000";
export const VERIFIER_ROLE = keccak256(toBytes("VERIFIER_ROLE"));

const lc = (v: string) => v.toLowerCase();

async function readIndexed<T>(count: bigint, read: (index: bigint) => Promise<T>): Promise<T[]> {
  const values: T[] = [];
  for (let offset = 0n; offset < count; offset += 20n) {
    const size = Number(count - offset < 20n ? count - offset : 20n);
    values.push(...await Promise.all(Array.from({ length: size }, (_, index) => read(offset + BigInt(index)))));
  }
  return values;
}

export function loadMetadata<T>(hash: string): T | null {
  if (!hash || /^0x0+$/.test(hash)) return null;
  const row = getDb().prepare("SELECT data FROM metadata WHERE hash = ?").get(hash) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as T) : null;
}

// Campaign terms never change after publication, so only status needs a fresh read.
const campaignCache = new Map<string, Awaited<ReturnType<typeof readCampaign>>>();

async function readCampaign(id: string) {
  const dep = getDeployment();
  return publicClient.readContract({
    address: dep.ProductCampaign,
    abi: productCampaignAbi,
    functionName: "getCampaign",
    args: [BigInt(id)],
  });
}

async function immutableCampaign(id: string) {
  const key = `${getDeployment().ProductCampaign}:${id}`;
  let c = campaignCache.get(key);
  if (!c) {
    c = await readCampaign(id);
    campaignCache.set(key, c);
  }
  return c;
}

async function readProject(id: string) {
  const dep = getDeployment();
  return publicClient.readContract({
    address: dep.CharityRegistry,
    abi: charityRegistryAbi,
    functionName: "getProject",
    args: [BigInt(id)],
  });
}

async function readCharity(wallet: Hex) {
  const dep = getDeployment();
  return publicClient.readContract({
    address: dep.CharityRegistry,
    abi: charityRegistryAbi,
    functionName: "getCharity",
    args: [wallet],
  });
}

async function readMerchant(wallet: Hex) {
  const dep = getDeployment();
  return publicClient.readContract({
    address: dep.MerchantRegistry,
    abi: merchantRegistryAbi,
    functionName: "getMerchant",
    args: [wallet],
  });
}

async function usdcBalance(address: Hex): Promise<bigint> {
  const dep = getDeployment();
  return publicClient.readContract({
    address: dep.MockUSDC,
    abi: mockUSDCAbi,
    functionName: "balanceOf",
    args: [address],
  });
}

/* ------------------------------ orders ------------------------------ */

type OrderFilter = { buyer?: string; merchant?: string; campaignId?: string; projectId?: string; paymentId?: string };

export async function getOrders(filter: OrderFilter = {}): Promise<OrderView[]> {
  const router = { address: getDeployment().CheckoutRouter, abi: checkoutRouterAbi };
  const ids = filter.paymentId ? [filter.paymentId as Hex] : await readIndexed(
    await publicClient.readContract({ ...router, functionName: "paymentCount" }),
    (index) => publicClient.readContract({ ...router, functionName: "paymentIdAt", args: [index] }),
  );
  const projectTitles = new Map<string, string | null>();

  const views: OrderView[] = [];
  for (const paymentId of ids.reverse()) {
    const payment = await publicClient.readContract({ ...router, functionName: "getPayment", args: [paymentId] });
    if (payment.status === 0) continue;
    if (filter.buyer && lc(payment.buyer) !== lc(filter.buyer)) continue;
    const campaignId = payment.campaignId.toString();
    if (filter.campaignId && campaignId !== filter.campaignId) continue;
    const c = await immutableCampaign(campaignId);
    const projectId = c.projectId.toString();
    if (filter.merchant && lc(c.merchant) !== lc(filter.merchant)) continue;
    if (filter.projectId && projectId !== filter.projectId) continue;

    if (!projectTitles.has(projectId)) {
      const p = await readProject(projectId);
      projectTitles.set(projectId, loadMetadata<ProjectMeta>(p.metadataHash)?.title ?? null);
    }
    views.push({
      paymentId,
      productId: c.productId,
      productName: loadMetadata<ProductMeta>(c.metadataHash)?.name ?? null,
      campaignId,
      projectId,
      projectTitle: projectTitles.get(projectId) ?? null,
      merchant: c.merchant,
      buyer: payment.buyer,
      quantity: payment.quantity,
      gross: payment.gross.toString(),
      donation: payment.donation.toString(),
      fee: payment.fee.toString(),
      token: c.paymentToken,
      orderHash: payment.orderHash,
      status: PAYMENT_STATUS[payment.status],
      txHash: null,
      timestamp: Number(payment.createdAt),
      settleAfter: Number(payment.settleAfter),
      settleTxHash: null,
      refundTxHash: null,
    });
  }
  return views;
}

/* ----------------------------- campaigns ---------------------------- */

export async function getCampaigns(filter: { merchant?: string; activeOnly?: boolean } = {}): Promise<CampaignView[]> {
  const count = await publicClient.readContract({
    address: getDeployment().ProductCampaign, abi: productCampaignAbi, functionName: "campaignCount",
  });
  const campaigns = await readIndexed(count, async (index) => ({ id: (index + 1n).toString(), fresh: await readCampaign((index + 1n).toString()) }));
  const orders = await getOrders();

  const views: CampaignView[] = [];
  for (const { id, fresh } of campaigns.reverse()) {
    const status = CAMPAIGN_STATUS[Number(fresh.status)];
    if (filter.activeOnly && status !== "Active") continue;
    if (filter.merchant && lc(fresh.merchant) !== lc(filter.merchant)) continue;
    views.push(await campaignView(id, fresh, orders));
  }
  return views;
}

async function campaignView(id: string, fresh: Awaited<ReturnType<typeof readCampaign>>, orders: OrderView[]): Promise<CampaignView> {
    const project = await readProject(fresh.projectId.toString());
    const merchantMeta = loadMetadata<MerchantProfileMeta>((await readMerchant(fresh.merchant)).metadataHash);
    const mine = orders.filter((o) => o.campaignId === id && o.status !== "Refunded");
    const latest = await publicClient.readContract({
      address: getDeployment().ProductCampaign, abi: productCampaignAbi, functionName: "latestCampaignOf", args: [fresh.productId],
    });
    return {
      campaignId: id,
      productId: fresh.productId,
      merchant: fresh.merchant,
      merchantName: merchantMeta?.name ?? null,
      merchantReceiver: fresh.merchantReceiver,
      projectId: fresh.projectId.toString(),
      projectTitle: loadMetadata<ProjectMeta>(project.metadataHash)?.title ?? null,
      charityTreasury: fresh.charityTreasury,
      paymentToken: fresh.paymentToken,
      unitPrice: fresh.unitPrice.toString(),
      fixedDonationAmount: fresh.fixedDonationAmount.toString(),
      percentageDonationBps: fresh.percentageDonationBps,
      serviceFeeBps: fresh.serviceFeeBps,
      maxDonation: fresh.maxDonation.toString(),
      saleStart: Number(fresh.saleStart),
      saleEnd: Number(fresh.saleEnd),
      refundWindow: Number(fresh.refundWindow),
      ruleVersion: fresh.ruleVersion,
      status: CAMPAIGN_STATUS[Number(fresh.status)],
      isLatest: latest.toString() === id,
      metadataHash: fresh.metadataHash,
      meta: loadMetadata<ProductMeta>(fresh.metadataHash),
      stats: {
        units: mine.reduce((n, o) => n + o.quantity, 0),
        orders: mine.length,
        gross: mine.reduce((n, o) => n + BigInt(o.gross), 0n).toString(),
        donated: mine.reduce((n, o) => n + BigInt(o.donation), 0n).toString(),
      },
      txHash: null,
    };
}

export async function getCampaign(id: string): Promise<CampaignView | null> {
  if (!/^\d+$/.test(id) || BigInt(id) < 1n) return null;
  const fresh = await readCampaign(id);
  if (fresh.merchant === ZERO) return null;
  return campaignView(id, fresh, await getOrders({ campaignId: id }));
}

/* ------------------------------ parties ----------------------------- */

const APPLICANT_PAGE = 100n;

// Merchants are read from the registry's own applicant list, so no event-log scan is needed.
async function getMerchantParties(wallet?: string): Promise<PartyView[]> {
  const dep = getDeployment();
  let wallets: Hex[];
  if (wallet) {
    wallets = [wallet as Hex];
  } else {
    const total = await publicClient.readContract({ address: dep.MerchantRegistry, abi: merchantRegistryAbi, functionName: "applicantCount" });
    wallets = [];
    for (let offset = 0n; offset < total; offset += APPLICANT_PAGE) {
      const page = await publicClient.readContract({
        address: dep.MerchantRegistry,
        abi: merchantRegistryAbi,
        functionName: "getApplicants",
        args: [offset, APPLICANT_PAGE],
      });
      wallets.push(...page);
    }
  }

  const views: PartyView[] = [];
  const merchants = await Promise.all(wallets.map((w) => readMerchant(w)));
  merchants.forEach((m, i) => {
    if (Number(m.status) === 0) return;
    views.push({
      wallet: wallets[i],
      kind: "merchant",
      status: MERCHANT_STATUS[Number(m.status)],
      metadataHash: m.metadataHash,
      receiver: m.receiver === ZERO ? null : m.receiver,
      meta: loadMetadata<MerchantProfileMeta>(m.metadataHash),
      appliedAt: Number(m.appliedAt),
    });
  });
  return views.sort((a, b) => b.appliedAt - a.appliedAt);
}

export async function getParties(kind: "merchant" | "charity", wallet?: string): Promise<PartyView[]> {
  if (kind === "merchant") return getMerchantParties(wallet);
  const registry = { address: getDeployment().CharityRegistry, abi: charityRegistryAbi };
  const wallets: Hex[] = wallet ? [wallet as Hex] : [];
  if (!wallet) {
    const total = await publicClient.readContract({ ...registry, functionName: "applicantCount" });
    for (let offset = 0n; offset < total; offset += APPLICANT_PAGE) {
      wallets.push(...await publicClient.readContract({ ...registry, functionName: "getApplicants", args: [offset, APPLICANT_PAGE] }));
    }
  }
  const views: PartyView[] = [];
  for (const address of wallets) {
    const c = await readCharity(address);
    if (c.status === 0) continue;
    views.push({
      wallet: address,
      kind: "charity",
      status: CHARITY_STATUS[Number(c.status)],
      metadataHash: c.metadataHash,
      receiver: null,
      meta: loadMetadata<CharityProfileMeta>(c.metadataHash),
      appliedAt: Number(c.appliedAt),
    });
  }
  return views.sort((a, b) => b.appliedAt - a.appliedAt);
}

/* ------------------------------ evidence ---------------------------- */

export async function getEvidence(filter: { projectId?: string; status?: string } = {}): Promise<EvidenceView[]> {
  const dep = getDeployment();
  const registry = { address: dep.EvidenceRegistry, abi: evidenceRegistryAbi };
  const count = await publicClient.readContract({ ...registry, functionName: "evidenceCount" });
  const entries = await readIndexed(count, async (index) => ({
    id: index + 1n,
    ev: await publicClient.readContract({ ...registry, functionName: "getEvidence", args: [index + 1n] }),
  }));
  const db = getDb();
  const views: EvidenceView[] = [];
  for (const { id, ev } of entries.reverse()) {
    if (filter.projectId && ev.projectId.toString() !== filter.projectId) continue;
    const status = EVIDENCE_STATUS[Number(ev.status)];
    if (filter.status && status !== filter.status) continue;
    const file = db
      .prepare("SELECT file_name, mime, size FROM evidence_files WHERE content_hash = ?")
      .get(ev.contentHash) as { file_name: string; mime: string; size: number } | undefined;
    views.push({
      evidenceId: id.toString(),
      projectId: ev.projectId.toString(),
      contentHash: ev.contentHash,
      kind: EVIDENCE_KIND[Number(ev.kind)],
      status,
      submitter: ev.submitter,
      verifier: ev.verifier === ZERO ? null : ev.verifier,
      submittedAt: Number(ev.submittedAt),
      verifiedAt: Number(ev.verifiedAt),
      noteHash: /^0x0+$/.test(ev.noteHash) ? null : ev.noteHash,
      storageRef: await publicClient.readContract({ ...registry, functionName: "storageRefOf", args: [id] }),
      txHash: null,
      file: file ? { name: file.file_name, mime: file.mime, size: file.size } : null,
    });
  }
  return views;
}

/* ----------------------------- treasuries --------------------------- */

export async function getTreasury(address: Hex): Promise<TreasuryView> {
  const read = <T extends "owners" | "threshold" | "proposalCount">(fn: T) =>
    publicClient.readContract({ address, abi: donationTreasuryAbi, functionName: fn });
  const [owners, threshold, count, balance] = await Promise.all([
    read("owners"),
    read("threshold"),
    read("proposalCount"),
    usdcBalance(address),
  ]);

  const proposals = await Promise.all(
    Array.from({ length: Number(count) }, (_, i) => i + 1).map(async (id) => {
      const p = await publicClient.readContract({
        address,
        abi: donationTreasuryAbi,
        functionName: "getProposal",
        args: [BigInt(id)],
      });
      const flags = await Promise.all(
        owners.map((o) =>
          publicClient.readContract({
            address,
            abi: donationTreasuryAbi,
            functionName: "approvedBy",
            args: [BigInt(id), o],
          }),
        ),
      );
      return {
        proposalId: String(id),
        token: p.token,
        to: p.to,
        amount: p.amount.toString(),
        purposeHash: p.purposeHash,
        approvals: p.approvals,
        executed: p.executed,
        approvedBy: owners.filter((_, i) => flags[i]),
      };
    }),
  );

  const projects = await readProjects();
  const projectIds = projects.filter(({ project }) => lc(project.treasury) === lc(address)).map(({ id }) => id);

  return {
    address,
    owners: [...owners],
    threshold: Number(threshold),
    balance: balance.toString(),
    proposals: proposals.reverse(),
    projectIds,
  };
}

export async function getTreasuriesFor(wallet: string): Promise<TreasuryView[]> {
  const addresses = await publicClient.readContract({
    address: getDeployment().TreasuryFactory,
    abi: treasuryFactoryAbi,
    functionName: "treasuriesFor",
    args: [wallet as Hex],
  });
  return Promise.all([...addresses].reverse().map((address) => getTreasury(address)));
}

/* ------------------------------ projects ---------------------------- */

async function reportRefs(projectId: string): Promise<ReportRef[]> {
  const registry = { address: getDeployment().ImpactReportRegistry, abi: impactReportRegistryAbi };
  const count = await publicClient.readContract({ ...registry, functionName: "reportCount", args: [BigInt(projectId)] });
  return readIndexed(count, async (index) => {
    const [report, uri] = await Promise.all([
      publicClient.readContract({ ...registry, functionName: "reportAt", args: [BigInt(projectId), index] }),
      publicClient.readContract({ ...registry, functionName: "reportUri", args: [BigInt(projectId), index] }),
    ]);
    return { version: report.version, reportHash: report.reportHash, publishedAt: Number(report.publishedAt), uri };
  });
}

async function readProjects() {
  const count = await publicClient.readContract({
    address: getDeployment().CharityRegistry, abi: charityRegistryAbi, functionName: "projectCount",
  });
  return readIndexed(count, async (index) => ({ id: (index + 1n).toString(), project: await readProject((index + 1n).toString()) }));
}

async function projectView(projectId: string, orders: OrderView[], evidence: EvidenceView[]): Promise<ProjectView> {
  const p = await readProject(projectId);
  const charity = await readCharity(p.charity);
  const mine = orders.filter((o) => o.projectId === projectId);
  const sum = (status: string) =>
    mine.filter((o) => o.status === status).reduce((n, o) => n + BigInt(o.donation), 0n).toString();
  const refs = await reportRefs(projectId);
  return {
    projectId,
    charity: p.charity,
    charityName: loadMetadata<CharityProfileMeta>(charity.metadataHash)?.name ?? null,
    treasury: p.treasury,
    metadataHash: p.metadataHash,
    targetAmount: p.targetAmount.toString(),
    status: PROJECT_STATUS[Number(p.status)],
    meta: loadMetadata<ProjectMeta>(p.metadataHash),
    received: sum("Settled"),
    pending: sum("Escrowed"),
    orders: mine.filter((o) => o.status !== "Refunded").length,
    treasuryBalance: (await usdcBalance(p.treasury)).toString(),
    evidence: {
      submitted: evidence.length,
      verified: evidence.filter((e) => e.status === "Verified").length,
      rejected: evidence.filter((e) => e.status === "Rejected").length,
    },
    latestReport: refs.length ? refs[refs.length - 1] : null,
  };
}

export async function getProjects(filter: { charity?: string } = {}): Promise<ProjectView[]> {
  const projects = (await readProjects()).reverse().filter(({ project }) => !filter.charity || lc(project.charity) === lc(filter.charity));
  const [orders, evidence] = await Promise.all([getOrders(), getEvidence()]);
  return readIndexed(BigInt(projects.length), (index) =>
    projectView(projects[Number(index)].id, orders, evidence.filter((ev) => ev.projectId === projects[Number(index)].id)),
  );
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  const count = await publicClient.readContract({
    address: getDeployment().CharityRegistry,
    abi: charityRegistryAbi,
    functionName: "projectCount",
  });
  if (!/^\d+$/.test(projectId) || BigInt(projectId) < 1n || BigInt(projectId) > count) return null;

  const [orders, evidence] = await Promise.all([getOrders({ projectId }), getEvidence({ projectId })]);
  const base = await projectView(projectId, orders, evidence);
  return { ...base, evidenceList: evidence, orderList: orders, reports: await reportRefs(projectId) };
}

/* ------------------------------- reports ---------------------------- */

export async function buildReportSnapshot(projectId: string): Promise<ReportSnapshot | null> {
  const detail = await getProjectDetail(projectId);
  if (!detail) return null;

  const treasury = await getTreasury(detail.treasury);
  const live = detail.orderList.filter((o) => o.status !== "Refunded");
  const sumDonation = (status: string) =>
    detail.orderList.filter((o) => o.status === status).reduce((n, o) => n + BigInt(o.donation), 0n);
  const disbursed = treasury.proposals
    .filter((p) => p.executed)
    .reduce((n, p) => n + BigInt(p.amount), 0n);

  return {
    schema: "shanliu-visible/impact-report@1",
    chainId: CHAIN_ID,
    projectId,
    generatedAt: Math.floor(Date.now() / 1000),
    project: {
      title: detail.meta?.title ?? `Project #${projectId}`,
      category: detail.meta?.category ?? "Unspecified",
      charity: detail.charity,
      charityName: detail.charityName,
      treasury: detail.treasury,
      targetAmount: detail.targetAmount,
      status: detail.status,
    },
    totals: {
      orders: live.length,
      units: live.reduce((n, o) => n + o.quantity, 0),
      gross: live.reduce((n, o) => n + BigInt(o.gross), 0n).toString(),
      donationsSettled: sumDonation("Settled").toString(),
      donationsPending: sumDonation("Escrowed").toString(),
      donationsRefunded: sumDonation("Refunded").toString(),
      disbursed: disbursed.toString(),
      treasuryBalance: treasury.balance,
    },
    orders: detail.orderList.map((o) => ({
      paymentId: o.paymentId,
      txHash: o.txHash,
      campaignId: o.campaignId,
      productName: o.productName,
      quantity: o.quantity,
      gross: o.gross,
      donation: o.donation,
      status: o.status,
      timestamp: o.timestamp,
    })),
    evidence: detail.evidenceList.map((e) => ({
      evidenceId: e.evidenceId,
      kind: e.kind,
      contentHash: e.contentHash,
      status: e.status,
      verifier: e.verifier,
      submittedAt: e.submittedAt,
      verifiedAt: e.verifiedAt,
      txHash: e.txHash,
    })),
    disbursements: treasury.proposals.map((p) => ({
      proposalId: p.proposalId,
      to: p.to,
      amount: p.amount,
      purposeHash: p.purposeHash,
      executed: p.executed,
    })),
  };
}

export async function getPublishedReport(projectId: string, version?: number): Promise<PublishedReport | null> {
  const refs = await reportRefs(projectId);
  const ref = version ? refs.find((r) => r.version === version) : refs[refs.length - 1];
  if (!ref) return null;
  const snapshot = loadMetadata<ReportSnapshot>(ref.reportHash);
  const hashMatches = snapshot
    ? keccak256(toBytes(canonicalize({ kind: "impact-report", data: snapshot }))) === ref.reportHash
    : false;
  return { ref, snapshot, hashMatches };
}

/* ------------------------------ overview ---------------------------- */

export async function getAdminOverview(): Promise<AdminOverview> {
  const dep = getDeployment();
  const [platformReceiver, serviceFeeBps, globalPaused, tokenAllowed] = await Promise.all([
    publicClient.readContract({ address: dep.CheckoutRouter, abi: checkoutRouterAbi, functionName: "platformReceiver" }),
    publicClient.readContract({ address: dep.ProductCampaign, abi: productCampaignAbi, functionName: "defaultServiceFeeBps" }),
    publicClient.readContract({ address: dep.PauseController, abi: pauseControllerAbi, functionName: "globalPaused" }),
    publicClient.readContract({
      address: dep.ProductCampaign,
      abi: productCampaignAbi,
      functionName: "allowedToken",
      args: [dep.MockUSDC],
    }),
  ]);

  const registry = { address: dep.EvidenceRegistry, abi: evidenceRegistryAbi };
  const pauser = { address: dep.PauseController, abi: pauseControllerAbi };
  const [verifierCount, campaignCount, projectCount] = await Promise.all([
    publicClient.readContract({ ...registry, functionName: "getRoleMemberCount", args: [VERIFIER_ROLE] }),
    publicClient.readContract({ ...pauser, functionName: "pausedCampaignCount" }),
    publicClient.readContract({ ...pauser, functionName: "pausedProjectCount" }),
  ]);
  const [verifiers, pausedCampaigns, pausedProjects] = await Promise.all([
    readIndexed(verifierCount, (index) => publicClient.readContract({ ...registry, functionName: "getRoleMember", args: [VERIFIER_ROLE, index] })),
    readIndexed(campaignCount, (index) => publicClient.readContract({ ...pauser, functionName: "pausedCampaignAt", args: [index] })),
    readIndexed(projectCount, (index) => publicClient.readContract({ ...pauser, functionName: "pausedProjectAt", args: [index] })),
  ]);

  return {
    admin: dep.admin,
    platformReceiver,
    serviceFeeBps,
    globalPaused,
    tokenAllowed,
    verifiers,
    pausedCampaigns: pausedCampaigns.map(String),
    pausedProjects: pausedProjects.map(String),
  };
}

export async function getStats(): Promise<Stats> {
  const orders = await getOrders();
  const evidence = await getEvidence();
  const donated = orders.filter((o) => o.status === "Settled").reduce((n, o) => n + BigInt(o.donation), 0n);
  return {
    orders: orders.filter((o) => o.status !== "Refunded").length,
    donated: donated.toString(),
    projects: Number(await publicClient.readContract({ address: getDeployment().CharityRegistry, abi: charityRegistryAbi, functionName: "projectCount" })),
    merchants: (await getParties("merchant")).filter((m) => m.status === "Approved").length,
    verifiedEvidence: evidence.filter((e) => e.status === "Verified").length,
    totalEvidence: evidence.length,
  };
}
