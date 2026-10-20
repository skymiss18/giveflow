import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashMetadata } from "@/lib/shared/metadata";
import type { Hex } from "@/lib/shared/types";
import {
  buildReportSnapshot, getAdminOverview, getCampaign, getCampaigns, getEvidence, getOrders,
  getParties, getProjectDetail, getProjects, getPublishedReport, getStats, getTreasuriesFor,
} from "./queries";

const mocks = vi.hoisted(() => ({ read: vi.fn(), sql: vi.fn(), deployment: vi.fn(), logs: vi.fn() }));
vi.mock("./chain", () => ({ CHAIN_ID: 31337, publicClient: { readContract: mocks.read, getLogs: mocks.logs } }));
vi.mock("./db", () => ({ getDb: () => ({ prepare: mocks.sql }) }));
vi.mock("@/lib/shared/chain", () => ({ getDeployment: mocks.deployment }));

const address = (value: number): Hex => `0x${value.toString(16).padStart(40, "0")}`;
const hash = (value: number): Hex => `0x${value.toString(16).padStart(64, "0")}`;
const merchant = address(11);
const charity = address(12);
const buyer = address(13);
const treasury = address(14);
const verifier = address(15);
const zero = address(0);
const dep = {
  admin: address(1), MerchantRegistry: address(2), CharityRegistry: address(3), ProductCampaign: address(4),
  CheckoutRouter: address(5), EvidenceRegistry: address(6), ImpactReportRegistry: address(7),
  PauseController: address(8), TreasuryFactory: address(9), MockUSDC: address(10),
};
const metadata = new Map<string, unknown>();
let reportHash: Hex;
let paymentStatus = 2;

beforeEach(() => {
  vi.clearAllMocks();
  paymentStatus = 2;
  metadata.clear();
  metadata.set(hash(101), { name: "Product" });
  metadata.set(hash(102), { name: "Merchant" });
  metadata.set(hash(103), { name: "Charity" });
  metadata.set(hash(104), { title: "Project", category: "Education" });
  const snapshot = { projectId: "1", generatedAt: 100 };
  reportHash = hashMetadata("impact-report", snapshot);
  metadata.set(reportHash, snapshot);
  mocks.deployment.mockReturnValue(dep);
  mocks.logs.mockImplementation(() => { throw new Error("Event RPC must not be used"); });
  mocks.sql.mockImplementation((sql: string) => {
    if (sql.includes("FROM metadata")) return { get: (key: string) => metadata.has(key) ? { data: JSON.stringify(metadata.get(key)) } : undefined };
    if (sql.includes("FROM evidence_files")) return { get: () => ({ file_name: "receipt.pdf", mime: "application/pdf", size: 100 }) };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  mocks.read.mockImplementation(async (request: { address: string; functionName: string; args?: readonly unknown[] }) => {
    const args = request.args ?? [];
    const index = Number(args[0]);
    switch (request.functionName) {
      case "paymentCount": return 3n;
      case "paymentIdAt": return hash(index + 1);
      case "getPayment": return {
        campaignId: 1n, buyer, quantity: 2, gross: 50n, donation: 4n, fee: 1n, orderHash: hash(200),
        createdAt: 100n + BigInt(args[0] as string), settleAfter: 1000n,
        status: args[0] === hash(1) ? paymentStatus : args[0] === hash(2) ? 1 : args[0] === hash(3) ? 3 : 0,
      };
      case "campaignCount": return 2n;
      case "getCampaign": return {
        productId: hash(100), merchant: index > 2 ? zero : merchant, merchantReceiver: merchant,
        projectId: 1n, charityTreasury: treasury, paymentToken: dep.MockUSDC, unitPrice: 25n,
        fixedDonationAmount: 2n, percentageDonationBps: 0, serviceFeeBps: 200,
        maxDonation: 0n, saleStart: 1n, saleEnd: 9999999999n, refundWindow: 900n,
        ruleVersion: index === 1 ? 2 : 1, status: index === 1 ? 0 : 2, metadataHash: hash(101),
      };
      case "latestCampaignOf": return 1n;
      case "getMerchant": return { status: 2, receiver: merchant, metadataHash: hash(102), appliedAt: 10n };
      case "getCharity": return { status: args[0] === charity ? 2 : 0, metadataHash: hash(103), appliedAt: 20n };
      case "applicantCount": return 1n;
      case "getApplicants": return request.address === dep.MerchantRegistry ? [merchant] : [charity];
      case "projectCount": return 2n;
      case "getProject": return { charity: index === 1 ? charity : address(99), treasury: index === 1 ? treasury : address(98), metadataHash: hash(104), targetAmount: 500n, status: 1 };
      case "evidenceCount": return 2n;
      case "getEvidence": return {
        projectId: BigInt(index), contentHash: hash(300 + index), kind: 3, status: index === 1 ? 2 : 1,
        submitter: charity, verifier: index === 1 ? verifier : zero, submittedAt: 30n, verifiedAt: 40n, noteHash: hash(0),
      };
      case "storageRefOf": return `local://evidence/${index}`;
      case "reportCount": return index === 1 ? 1n : 0n;
      case "reportAt": return { version: 1, reportHash, publishedAt: 50n, publisher: charity };
      case "reportUri": return "/reports/1";
      case "treasuriesFor": return [treasury];
      case "owners": return [charity, verifier];
      case "threshold": return 2n;
      case "proposalCount": return 1n;
      case "getProposal": return { token: dep.MockUSDC, to: merchant, amount: 2n, purposeHash: hash(400), approvals: 2, executed: true };
      case "approvedBy": return true;
      case "balanceOf": return 7n;
      case "getRoleMemberCount": return 1n;
      case "getRoleMember": return verifier;
      case "pausedCampaignCount": return 1n;
      case "pausedCampaignAt": return 999n;
      case "pausedProjectCount": return 1n;
      case "pausedProjectAt": return 888n;
      case "platformReceiver": return dep.admin;
      case "defaultServiceFeeBps": return 200;
      case "globalPaused": return false;
      case "allowedToken": return true;
      default: throw new Error(`Unexpected contract read: ${request.functionName}`);
    }
  });
});

describe("contract-backed queries without an event database", () => {
  it("reads payment state and filters orders without reconstructing events", async () => {
    const orders = await getOrders();
    expect(orders.map((order) => order.status)).toEqual(["Refunded", "Escrowed", "Settled"]);
    expect(orders[2]).toMatchObject({ paymentId: hash(1), timestamp: 101, settleAfter: 1000, fee: "1", txHash: null });
    expect(await getOrders({ buyer: address(99) })).toEqual([]);
    expect(await getOrders({ merchant: address(99) })).toEqual([]);
    expect(await getOrders({ projectId: "2" })).toEqual([]);
    expect(await getOrders({ campaignId: "2" })).toEqual([]);
    mocks.read.mockClear();
    expect(await getOrders({ paymentId: hash(999) })).toEqual([]);
    expect(mocks.read.mock.calls.map(([request]) => request.functionName)).toEqual(["getPayment"]);
    paymentStatus = 3;
    expect((await getOrders({ paymentId: hash(1) }))[0].status).toBe("Refunded");
  });

  it("enumerates campaigns and uses the contract's latest version and payment totals", async () => {
    const campaigns = await getCampaigns({ activeOnly: true });
    expect(campaigns).toHaveLength(1);
    expect(campaigns[0]).toMatchObject({ campaignId: "1", isLatest: true, stats: { units: 4, orders: 2, gross: "100", donated: "8" } });
    expect(await getCampaigns({ merchant: address(99) })).toEqual([]);
    expect((await getCampaign("2"))?.isLatest).toBe(false);
    expect(await getCampaign("3")).toBeNull();
  });

  it("reads charity and merchant lists and application timestamps from registries", async () => {
    expect((await getParties("charity"))[0]).toMatchObject({ wallet: charity, appliedAt: 20 });
    expect((await getParties("charity", charity))[0].appliedAt).toBe(20);
    expect(await getParties("charity", address(99))).toEqual([]);
    expect((await getParties("merchant"))[0]).toMatchObject({ wallet: merchant, appliedAt: 10 });
  });

  it("reads evidence references, project relationships and reports from contracts", async () => {
    expect(await getEvidence({ projectId: "1", status: "Verified" })).toMatchObject([{ evidenceId: "1", storageRef: "local://evidence/1", txHash: null }]);
    expect(await getEvidence({ status: "Rejected" })).toEqual([]);
    expect((await getProjects({ charity })).map((project) => project.projectId)).toEqual(["1"]);
    expect((await getTreasuriesFor(charity))[0]).toMatchObject({ projectIds: ["1"], balance: "7", proposals: [{ executed: true }] });
    expect(await getProjectDetail("1")).toMatchObject({ received: "4", pending: "4", orders: 2, latestReport: { uri: "/reports/1", version: 1 } });
    expect(await getProjectDetail("3")).toBeNull();
    expect(await getPublishedReport("1")).toMatchObject({ hashMatches: true, ref: { reportHash, publishedAt: 50 } });
    expect(await getPublishedReport("1", 2)).toBeNull();
    expect(await buildReportSnapshot("1")).toMatchObject({ totals: { donationsSettled: "4", donationsPending: "4", donationsRefunded: "4", disbursed: "2" } });
    expect(mocks.logs).not.toHaveBeenCalled();
  });

  it("reads live role and pause enumeration and computes statistics", async () => {
    expect(await getAdminOverview()).toMatchObject({ verifiers: [verifier], pausedCampaigns: ["999"], pausedProjects: ["888"] });
    expect(await getStats()).toEqual({ orders: 2, donated: "4", projects: 2, merchants: 1, verifiedEvidence: 1, totalEvidence: 2 });
    expect(mocks.logs).not.toHaveBeenCalled();
  });

  it("surfaces RPC failure instead of returning empty or stale event results", async () => {
    mocks.read.mockRejectedValue(new Error("RPC unavailable"));
    await expect(getCampaigns()).rejects.toThrow("RPC unavailable");
    await expect(getOrders()).rejects.toThrow("RPC unavailable");
  });
});