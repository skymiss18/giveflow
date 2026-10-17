import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { authMessage, type AuthAction } from "@/lib/shared/auth";
import type { StoreInvoice, StorePayment } from "@/lib/shared/pos";
import type { CampaignView, OrderView } from "@/lib/shared/types";
import { POST as create } from "@/app/api/pos/route";
import { GET as read, POST as claim } from "@/app/api/pos/[id]/route";

const mocks = vi.hoisted(() => ({
  campaign: vi.fn(), parties: vi.fn(), orders: vi.fn(), deployment: vi.fn(),
}));
vi.mock("./queries", () => ({ getCampaign: mocks.campaign, getParties: mocks.parties, getOrders: mocks.orders }));
vi.mock("./chain", () => ({ CHAIN_ID: 31337 }));
vi.mock("@/lib/shared/chain", () => ({ getDeployment: mocks.deployment }));
vi.mock("./db", () => {
  const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
  const db = new DatabaseSync(":memory:");
  return { getDb: () => db };
});

const merchant = privateKeyToAccount(`0x${"11".repeat(32)}`);
const buyer = privateKeyToAccount(`0x${"22".repeat(32)}`);
const outsider = privateKeyToAccount(`0x${"33".repeat(32)}`);
const router = "0x4444444444444444444444444444444444444444";
const token = "0x5555555555555555555555555555555555555555";
const now = 1_800_000_000;
const context = (id: string) => ({ params: Promise.resolve({ id }) });

async function signed(action: AuthAction, account = merchant, body: unknown = {}) {
  const issued = Math.floor(Date.now() / 1000);
  const signature = await account.signMessage({ message: authMessage(action, account.address, issued, 31337) });
  return new Request("http://localhost/api/pos", {
    method: "POST", body: JSON.stringify(body), headers: {
      "content-type": "application/json", "x-auth-address": account.address,
      "x-auth-issued": String(issued), "x-auth-signature": signature,
    },
  });
}

async function invoice() {
  const response = await create(await signed("pos:create", merchant, { campaignId: "1", quantity: 2, reference: "Till-01", unitPrice: "1", token: router }));
  expect(response.status).toBe(200);
  return await response.json() as StoreInvoice;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now * 1000);
  mocks.deployment.mockReturnValue({ CheckoutRouter: router, MockUSDC: token });
  mocks.campaign.mockResolvedValue({
    campaignId: "1", merchant: merchant.address, status: "Active", saleStart: now - 60,
    saleEnd: now + 3600, unitPrice: "25000000", paymentToken: token,
  } satisfies Partial<CampaignView>);
  mocks.parties.mockResolvedValue([{ status: "Approved" }]);
  mocks.orders.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

describe("store payment API", () => {
  it("requires a valid wallet signature and the correct authorization scope", async () => {
    expect((await create(new Request("http://localhost/api/pos", { method: "POST" }))).status).toBe(401);
    expect((await create(await signed("pos:claim"))).status).toBe(401);
  });

  it("rejects an unrelated or suspended merchant", async () => {
    expect((await create(await signed("pos:create", outsider, { campaignId: "1", quantity: 1 }))).status).toBe(403);
    mocks.parties.mockResolvedValue([{ status: "Suspended" }]);
    expect((await create(await signed("pos:create", merchant, { campaignId: "1", quantity: 1 }))).status).toBe(403);
  });

  it("rejects invalid quantities and products outside their sale window", async () => {
    expect((await create(await signed("pos:create", merchant, { campaignId: "1", quantity: 1.5 }))).status).toBe(400);
    mocks.campaign.mockResolvedValue({ ...await mocks.campaign(), saleEnd: now - 1 });
    expect((await create(await signed("pos:create", merchant, { campaignId: "1", quantity: 1 }))).status).toBe(409);
  });

  it("creates immutable server-priced terms and an expiring unique reference", async () => {
    const first = await invoice();
    const second = await invoice();
    expect(first).toMatchObject({ chainId: 31337, merchant: merchant.address, quantity: 2, reference: "Till-01", unitPrice: "25000000", createdAt: now, expiresAt: now + 900, buyer: null });
    expect(first.id).not.toBe(second.id);
    expect(first.orderHash).not.toBe(second.orderHash);
  });

  it("rejects unsupported tokens and bounds expiry by the campaign end", async () => {
    const campaign = await mocks.campaign();
    mocks.campaign.mockResolvedValue({ ...campaign, paymentToken: router });
    expect((await create(await signed("pos:create", merchant, { campaignId: "1", quantity: 1 }))).status).toBe(409);
    mocks.campaign.mockResolvedValue({ ...campaign, saleEnd: now + 60 });
    expect((await invoice()).expiresAt).toBe(now + 60);
  });

  it("atomically binds the first wallet and allows only that wallet to resume", async () => {
    const request = await invoice();
    const responses = await Promise.all([
      signed("pos:claim", buyer).then((req) => claim(req, context(request.id))),
      signed("pos:claim", outsider).then((req) => claim(req, context(request.id))),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const payment = await (await read(new Request("http://localhost"), context(request.id))).json() as StorePayment;
    const account = payment.invoice.buyer === buyer.address ? buyer : outsider;
    expect((await claim(await signed("pos:claim", account), context(request.id))).status).toBe(200);
    expect(payment.status).toBe("Awaiting payment");
  });

  it("expires unclaimed requests and isolates previous deployment requests", async () => {
    const request = await invoice();
    vi.setSystemTime((now + 901) * 1000);
    const expired = await (await read(new Request("http://localhost"), context(request.id))).json() as StorePayment;
    expect(expired.status).toBe("Expired");
    expect((await claim(await signed("pos:claim", buyer), context(request.id))).status).toBe(409);
    vi.setSystemTime(now * 1000);
    mocks.deployment.mockReturnValue({ CheckoutRouter: token });
    expect((await read(new Request("http://localhost"), context(request.id))).status).toBe(404);
  });

  it("does not mark an unrelated chain payment as received", async () => {
    const request = await invoice();
    await claim(await signed("pos:claim", buyer), context(request.id));
    const order = {
      buyer: buyer.address, merchant: request.merchant, campaignId: request.campaignId,
      quantity: request.quantity, gross: "50000000", token: request.token,
      orderHash: request.orderHash, timestamp: now + 1, status: "Settled",
    } satisfies Partial<OrderView>;
    mocks.orders.mockResolvedValue([{ ...order, gross: "1" }]);
    const mismatch = await (await read(new Request("http://localhost"), context(request.id))).json() as StorePayment;
    expect(mismatch).toMatchObject({ status: "Awaiting payment", order: null });
    mocks.orders.mockResolvedValue([order]);
    const confirmed = await (await read(new Request("http://localhost"), context(request.id))).json() as StorePayment;
    expect(confirmed.status).toBe("Payment received");
    vi.setSystemTime((now + 1000) * 1000);
    expect((await (await read(new Request("http://localhost"), context(request.id))).json() as StorePayment).status).toBe("Payment received");
  });
});