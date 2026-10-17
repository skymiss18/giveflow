import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAddress } from "viem";
import { checkoutRouterAbi } from "@/contracts/abis";
import { apiGet, apiPost } from "@/lib/client/api";
import type { StoreInvoice } from "@/lib/shared/pos";
import type { CampaignView } from "@/lib/shared/types";
import { assertStoreWalletIdentity, assertStoreWalletTerms, payWithStoreWallet } from "./store-wallet";

vi.mock("@/lib/client/api", () => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("@/lib/client/contracts", () => ({
  contracts: () => ({
    deployment: { chainId: 31337 },
    router: { address, abi: checkoutRouterAbi },
    usdc: { address, abi: [] },
  }),
}));

const address = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const invoice: StoreInvoice = {
  id: "invoice", chainId: 31337, router: address, merchant: address, campaignId: "1", quantity: 2,
  reference: "Till-02", unitPrice: "25000000", token: address,
  orderHash: `0x${"33".repeat(32)}`, createdAt: 100, expiresAt: 1000, buyer: null,
};
const campaign: CampaignView = {
  campaignId: "1", merchant: address, unitPrice: "25000000", paymentToken: address,
  status: "Active", saleStart: 50, saleEnd: 1500, productId: `0x${"44".repeat(32)}`,
  merchantName: "Shop", merchantReceiver: address, projectId: "1", projectTitle: "Project", charityTreasury: address,
  fixedDonationAmount: "1000000", percentageDonationBps: 0, serviceFeeBps: 0, maxDonation: "0", refundWindow: 0,
  ruleVersion: 1, isLatest: true, metadataHash: `0x${"55".repeat(32)}`, meta: null,
  stats: { units: 0, orders: 0, gross: "0", donated: "0" }, txHash: null,
};

describe("customer wallet checkout boundaries", () => {
  it("accepts only unchanged terms from the current deployment", () => {
    expect(() => assertStoreWalletTerms(invoice, campaign, 31337, address, 200)).not.toThrow();
    for (const changed of [
      { ...invoice, chainId: 1 }, { ...invoice, router: other }, { ...invoice, campaignId: "2" },
      { ...invoice, unitPrice: "1" }, { ...invoice, token: other }, { ...invoice, merchant: other },
    ] satisfies StoreInvoice[]) expect(() => assertStoreWalletTerms(changed, campaign, 31337, address, 200)).toThrow("does not match");
  });

  it("blocks expired, paused and out-of-window purchases", () => {
    expect(() => assertStoreWalletTerms(invoice, campaign, 31337, address, 1001)).toThrow("expired");
    expect(() => assertStoreWalletTerms(invoice, { ...campaign, status: "Paused" }, 31337, address, 200)).toThrow("not available");
    expect(() => assertStoreWalletTerms(invoice, campaign, 31337, address, 49)).toThrow("not available");
  });

  it("never substitutes another customer or chain for an assigned wallet", () => {
    expect(() => assertStoreWalletIdentity(invoice, other, 31337)).not.toThrow();
    expect(() => assertStoreWalletIdentity(invoice, address, 1)).toThrow("wrong network");
    expect(() => assertStoreWalletIdentity({ ...invoice, buyer: address }, other, 31337)).toThrow("another wallet");
  });
});

describe("isolated customer payment requests", () => {
  const signature = `0x${"66".repeat(65)}`;
  const authzSignature = `0x${"77".repeat(64)}1b`;
  const paymentHash = `0x${"88".repeat(32)}`;

  function setup() {
    const provider = {
      accounts: [address],
      chainId: 31337,
      request: vi.fn().mockResolvedValueOnce(signature).mockResolvedValueOnce(authzSignature),
    };
    const publicClient = {
      readContract: vi.fn().mockImplementation(async (request: { functionName: string }) => {
        if (request.functionName === "balanceOf") return 100_000_000n;
        if (request.functionName === "name") return "Mock USDC (Testnet)";
        if (request.functionName === "version") return "2";
        if (request.functionName === "authorizationNonce") return `0x${"99".repeat(32)}`;
        throw new Error(`unexpected read ${request.functionName}`);
      }),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
    };
    const onProgress = vi.fn();
    return { provider, publicClient, invoice, campaign, buyer: getAddress(address), isActive: () => true, onProgress };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(200_000);
    vi.mocked(apiGet).mockImplementation(async (path) => path.startsWith("/api/data/campaigns/") ? campaign : {
      invoice: { ...invoice, buyer: address }, status: "Awaiting payment", order: null,
    });
    vi.mocked(apiPost).mockImplementation(async (path) => path === "/api/relay/checkout" ? { hash: paymentHash } : { invoice: { ...invoice, buyer: address }, status: "Awaiting payment", order: null });
  });
  afterEach(() => vi.restoreAllMocks());

  it("uses only the customer wallet and submits the fixed signed invoice", async () => {
    const options = setup();
    await expect(payWithStoreWallet(options)).resolves.toBe(paymentHash);
    const calls = options.provider.request.mock.calls;
    expect(calls[0][0]).toMatchObject({ method: "personal_sign", params: [expect.any(String), address] });
    expect(calls[1][0]).toMatchObject({ method: "eth_signTypedData_v4", params: [address, expect.any(String)] });
    expect(calls[1][0].params[1]).toContain("ReceiveWithAuthorization");
    expect(options.provider.request).toHaveBeenCalledTimes(2);
    const relay = vi.mocked(apiPost).mock.calls.find(([path]) => path === "/api/relay/checkout");
    expect(relay).toBeDefined();
    const payload = relay?.[1] as { buyer: string; order: Record<string, unknown>; authorization: Record<string, unknown> };
    expect(payload.buyer).toBe(address);
    expect(payload.order).toMatchObject({
      productId: campaign.productId,
      campaignId: "1",
      quantity: 2,
      paymentToken: address,
      orderHash: invoice.orderHash,
      quotedUnitPrice: "25000000",
      orderExpiry: "1000",
    });
    expect(payload.authorization).toMatchObject({ validAfter: "0", validBefore: "1000", v: expect.any(Number), r: expect.any(String), s: expect.any(String) });
    expect(options.onProgress).toHaveBeenLastCalledWith("Verifying payment", paymentHash);
    expect(apiPost).toHaveBeenCalledWith(`/api/pos/${invoice.id}`, {}, expect.objectContaining({ "x-auth-address": address }));
  });

  it("does not request payment when the wallet declines the order signature", async () => {
    const options = setup();
    options.provider.request.mockReset().mockRejectedValue(new Error("User rejected"));
    await expect(payWithStoreWallet(options)).rejects.toThrow("User rejected");
    expect(options.provider.request).toHaveBeenCalledTimes(1);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("blocks a changed customer wallet before any transaction is submitted", async () => {
    const options = setup();
    options.provider.request.mockReset().mockImplementation(async () => {
      options.provider.accounts = [other];
      return signature;
    });
    await expect(payWithStoreWallet(options)).rejects.toThrow("another wallet");
    expect(apiPost).not.toHaveBeenCalledWith("/api/relay/checkout", expect.anything());
  });

  it("blocks paid invoices and cancelled sessions before requesting a signature", async () => {
    const options = setup();
    vi.mocked(apiGet).mockResolvedValue({ invoice, status: "Payment received", order: {} });
    await expect(payWithStoreWallet(options)).rejects.toThrow("no longer payable");
    await expect(payWithStoreWallet({ ...options, isActive: () => false })).rejects.toThrow("cancelled");
    expect(options.provider.request).not.toHaveBeenCalled();
  });

  it("stops when the checkout transaction reverts", async () => {
    const options = setup();
    options.publicClient.waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    await expect(payWithStoreWallet(options)).rejects.toThrow("Transaction reverted on-chain");
    expect(options.provider.request).toHaveBeenCalledTimes(2);
  });

  it("does not continue after cancellation while transaction confirmation was pending", async () => {
    const options = setup();
    let active = true;
    options.publicClient.waitForTransactionReceipt.mockImplementation(async () => {
      active = false;
      return { status: "success" };
    });
    await expect(payWithStoreWallet({ ...options, isActive: () => active })).rejects.toThrow("cancelled");
    expect(options.provider.request).toHaveBeenCalledTimes(2);
  });
});