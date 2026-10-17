import { keccak256, toBytes } from "viem";
import {
  charityRegistryAbi,
  checkoutRouterAbi,
  donationTreasuryAbi,
  evidenceRegistryAbi,
  merchantRegistryAbi,
  mockUSDCAbi,
  pauseControllerAbi,
  productCampaignAbi,
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
import { ensureSynced, queryEvents, type EventRow } from "./indexer";

const ZERO = "0x0000000000000000000000000000000000000000";
export const VERIFIER_ROLE = keccak256(toBytes("VERIFIER_ROLE"));

const str = (v: unknown) => String(v);
const lc = (v: string) => v.toLowerCase();

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
  await ensureSynced();
  const purchases = queryEvents({
    names: ["PurchaseCompleted"],
    where: {
      ...(filter.buyer ? { buyer: filter.buyer } : {}),
      ...(filter.campaignId ? { campaignId: filter.campaignId } : {}),
      ...(filter.paymentId ? { paymentId: filter.paymentId } : {}),
    },
    order: "desc",
  });
  const settled = new Map(queryEvents({ names: ["PaymentSettled"] }).map((e) => [lc(str(e.args.paymentId)), e]));
  const refunded = new Map(queryEvents({ names: ["RefundExecuted"] }).map((e) => [lc(str(e.args.paymentId)), e]));
  const projectTitles = new Map<string, string | null>();

  const views: OrderView[] = [];
  for (const e of purchases) {
    const campaignId = str(e.args.campaignId);
    const c = await immutableCampaign(campaignId);
    const projectId = c.projectId.toString();
    if (filter.merchant && lc(c.merchant) !== lc(filter.merchant)) continue;
    if (filter.projectId && projectId !== filter.projectId) continue;

    if (!projectTitles.has(projectId)) {
      const p = await readProject(projectId);
      projectTitles.set(projectId, loadMetadata<ProjectMeta>(p.metadataHash)?.title ?? null);
    }
    const key = lc(str(e.args.paymentId));
    const s = settled.get(key);
    const r = refunded.get(key);
    const gross = BigInt(str(e.args.gross));
    const donation = BigInt(str(e.args.donation));
    views.push({
      paymentId: e.args.paymentId as Hex,
      productId: e.args.productId as Hex,
      productName: loadMetadata<ProductMeta>(c.metadataHash)?.name ?? null,
      campaignId,
      projectId,
      projectTitle: projectTitles.get(projectId) ?? null,
      merchant: c.merchant,
      buyer: e.args.buyer as Hex,
      quantity: Number(e.args.quantity),
      gross: gross.toString(),
      donation: donation.toString(),
      fee: s ? str(s.args.fee) : ((gross * BigInt(c.serviceFeeBps)) / 10_000n).toString(),
      token: e.args.token as Hex,
      orderHash: e.args.orderHash as Hex,
      status: r ? PAYMENT_STATUS[3] : s ? PAYMENT_STATUS[2] : PAYMENT_STATUS[1],
      txHash: e.txHash,
      timestamp: e.timestamp,
      settleAfter: e.timestamp + Number(c.refundWindow),
      settleTxHash: s?.txHash ?? null,
      refundTxHash: r?.txHash ?? null,
    });
  }
  return views;
}

/* ----------------------------- campaigns ---------------------------- */

export async function getCampaigns(filter: { merchant?: string; activeOnly?: boolean } = {}): Promise<CampaignView[]> {
  await ensureSynced();
  const published = queryEvents({
    names: ["CampaignPublished"],
    where: filter.merchant ? { merchant: filter.merchant } : {},
    order: "desc",
  });
  const orders = await getOrders();
  const latestByProduct = new Map<string, string>();
  for (const e of queryEvents({ names: ["CampaignPublished"] })) {
    latestByProduct.set(lc(str(e.args.productId)), str(e.args.campaignId));
  }

  const views: CampaignView[] = [];
  for (const e of published) {
    const id = str(e.args.campaignId);
    const fresh = await readCampaign(id);
    const status = CAMPAIGN_STATUS[Number(fresh.status)];
    if (filter.activeOnly && status !== "Active") continue;

    const project = await readProject(fresh.projectId.toString());
    const merchantMeta = loadMetadata<MerchantProfileMeta>((await readMerchant(fresh.merchant)).metadataHash);
    const mine = orders.filter((o) => o.campaignId === id && o.status !== "Refunded");
    views.push({
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
      status,
      isLatest: latestByProduct.get(lc(fresh.productId)) === id,
      metadataHash: fresh.metadataHash,
      meta: loadMetadata<ProductMeta>(fresh.metadataHash),
      stats: {
        units: mine.reduce((n, o) => n + o.quantity, 0),
        orders: mine.length,
        gross: mine.reduce((n, o) => n + BigInt(o.gross), 0n).toString(),
        donated: mine.reduce((n, o) => n + BigInt(o.donation), 0n).toString(),
      },
      txHash: e.txHash,
    });
  }
  return views;
}

export async function getCampaign(id: string): Promise<CampaignView | null> {
  const all = await getCampaigns();
  return all.find((c) => c.campaignId === id) ?? null;
}

/* ------------------------------ parties ----------------------------- */

export async function getParties(kind: "merchant" | "charity", wallet?: string): Promise<PartyView[]> {
  await ensureSynced();
  const applied = queryEvents({
    names: [kind === "merchant" ? "MerchantApplied" : "CharityApplied"],
    where: wallet ? { wallet } : {},
  });
  const first = new Map<string, EventRow>();
  for (const e of applied) first.set(lc(str(e.args.wallet)), e);

  const views: PartyView[] = [];
  for (const [, e] of first) {
    const w = e.args.wallet as Hex;
    if (kind === "merchant") {
      const m = await readMerchant(w);
      views.push({
        wallet: w,
        kind,
        status: MERCHANT_STATUS[Number(m.status)],
        metadataHash: m.metadataHash,
        receiver: m.receiver === ZERO ? null : m.receiver,
        meta: loadMetadata<MerchantProfileMeta>(m.metadataHash),
        appliedAt: e.timestamp,
      });
    } else {
      const c = await readCharity(w);
      views.push({
        wallet: w,
        kind,
        status: CHARITY_STATUS[Number(c.status)],
        metadataHash: c.metadataHash,
        receiver: null,
        meta: loadMetadata<CharityProfileMeta>(c.metadataHash),
        appliedAt: e.timestamp,
      });
    }
  }
  return views.sort((a, b) => b.appliedAt - a.appliedAt);
}

/* ------------------------------ evidence ---------------------------- */

export async function getEvidence(filter: { projectId?: string; status?: string } = {}): Promise<EvidenceView[]> {
  await ensureSynced();
  const dep = getDeployment();
  const submitted = queryEvents({
    names: ["EvidenceSubmitted"],
    where: filter.projectId ? { projectId: filter.projectId } : {},
    order: "desc",
  });
  const db = getDb();
  const views: EvidenceView[] = [];
  for (const e of submitted) {
    const id = str(e.args.evidenceId);
    const ev = await publicClient.readContract({
      address: dep.EvidenceRegistry,
      abi: evidenceRegistryAbi,
      functionName: "getEvidence",
      args: [BigInt(id)],
    });
    const status = EVIDENCE_STATUS[Number(ev.status)];
    if (filter.status && status !== filter.status) continue;
    const file = db
      .prepare("SELECT file_name, mime, size FROM evidence_files WHERE content_hash = ?")
      .get(ev.contentHash) as { file_name: string; mime: string; size: number } | undefined;
    views.push({
      evidenceId: id,
      projectId: ev.projectId.toString(),
      contentHash: ev.contentHash,
      kind: EVIDENCE_KIND[Number(ev.kind)],
      status,
      submitter: ev.submitter,
      verifier: ev.verifier === ZERO ? null : ev.verifier,
      submittedAt: Number(ev.submittedAt),
      verifiedAt: Number(ev.verifiedAt),
      noteHash: /^0x0+$/.test(ev.noteHash) ? null : ev.noteHash,
      storageRef: str(e.args.storageRef),
      txHash: e.txHash,
      file: file ? { name: file.file_name, mime: file.mime, size: file.size } : null,
    });
  }
  return views;
}

/* ----------------------------- treasuries --------------------------- */

export async function getTreasury(address: Hex): Promise<TreasuryView> {
  await ensureSynced();
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

  const projectIds = queryEvents({ names: ["CharityProjectCreated"] })
    .filter((e) => lc(str(e.args.treasury)) === lc(address))
    .map((e) => str(e.args.projectId));

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
  await ensureSynced();
  const created = queryEvents({ names: ["TreasuryCreated"], order: "desc" });
  const mine = created.filter(
    (e) => lc(str(e.args.creator)) === lc(wallet) || (e.args.owners as string[]).some((o) => lc(o) === lc(wallet)),
  );
  return Promise.all(mine.map((e) => getTreasury(e.args.treasury as Hex)));
}

/* ------------------------------ projects ---------------------------- */

function reportRefs(projectId: string): ReportRef[] {
  return queryEvents({ names: ["ImpactReportPublished"], where: { projectId } }).map((e) => ({
    version: Number(e.args.version),
    reportHash: e.args.reportHash as Hex,
    publishedAt: e.timestamp,
    uri: str(e.args.uri),
  }));
}

async function projectView(projectId: string, orders: OrderView[], evidence: EvidenceView[]): Promise<ProjectView> {
  const p = await readProject(projectId);
  const charity = await readCharity(p.charity);
  const mine = orders.filter((o) => o.projectId === projectId);
  const sum = (status: string) =>
    mine.filter((o) => o.status === status).reduce((n, o) => n + BigInt(o.donation), 0n).toString();
  const refs = reportRefs(projectId);
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
  await ensureSynced();
  const created = queryEvents({
    names: ["CharityProjectCreated"],
    where: filter.charity ? { charity: filter.charity } : {},
    order: "desc",
  });
  const [orders, evidence] = await Promise.all([getOrders(), getEvidence()]);
  return Promise.all(
    created.map((e) =>
      projectView(
        str(e.args.projectId),
        orders,
        evidence.filter((ev) => ev.projectId === str(e.args.projectId)),
      ),
    ),
  );
}

export async function getProjectDetail(projectId: string): Promise<ProjectDetail | null> {
  await ensureSynced();
  const count = await publicClient.readContract({
    address: getDeployment().CharityRegistry,
    abi: charityRegistryAbi,
    functionName: "projectCount",
  });
  if (!/^\d+$/.test(projectId) || BigInt(projectId) < 1n || BigInt(projectId) > count) return null;

  const [orders, evidence] = await Promise.all([getOrders({ projectId }), getEvidence({ projectId })]);
  const base = await projectView(projectId, orders, evidence);
  return { ...base, evidenceList: evidence, orderList: orders, reports: reportRefs(projectId) };
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
  await ensureSynced();
  const refs = reportRefs(projectId);
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
  await ensureSynced();
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

  const granted = queryEvents({ names: ["RoleGranted"], address: dep.EvidenceRegistry, where: { role: VERIFIER_ROLE } });
  const candidates = [...new Set(granted.map((e) => str(e.args.account)))] as Hex[];
  const flags = await Promise.all(
    candidates.map((account) =>
      publicClient.readContract({
        address: dep.EvidenceRegistry,
        abi: evidenceRegistryAbi,
        functionName: "hasRole",
        args: [VERIFIER_ROLE, account],
      }),
    ),
  );

  const pauseEvents = (name: string, key: string) => {
    const latest = new Map<string, boolean>();
    for (const e of queryEvents({ names: [name], address: dep.PauseController })) {
      latest.set(str(e.args[key]), Boolean(e.args.paused));
    }
    return [...latest].filter(([, paused]) => paused).map(([id]) => id);
  };

  return {
    admin: dep.admin,
    platformReceiver,
    serviceFeeBps,
    globalPaused,
    tokenAllowed,
    verifiers: candidates.filter((_, i) => flags[i]),
    pausedCampaigns: pauseEvents("CampaignPaused", "campaignId"),
    pausedProjects: pauseEvents("ProjectPauseChanged", "projectId"),
  };
}

export async function getStats(): Promise<Stats> {
  await ensureSynced();
  const orders = await getOrders();
  const evidence = await getEvidence();
  const donated = orders.filter((o) => o.status === "Settled").reduce((n, o) => n + BigInt(o.donation), 0n);
  return {
    orders: orders.filter((o) => o.status !== "Refunded").length,
    donated: donated.toString(),
    projects: queryEvents({ names: ["CharityProjectCreated"] }).length,
    merchants: (await getParties("merchant")).filter((m) => m.status === "Approved").length,
    verifiedEvidence: evidence.filter((e) => e.status === "Verified").length,
    totalEvidence: evidence.length,
  };
}
