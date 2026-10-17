import { describe, expect, it } from "vitest";
import type { OrderView } from "./types";
import { matchesStoreInvoice, saleRequestSchema, storePaymentStatus, type StoreInvoice } from "./pos";

const address = "0x1111111111111111111111111111111111111111";
const hash = `0x${"22".repeat(32)}` as const;
const invoice: StoreInvoice = {
  id: "test", chainId: 31337, router: address, merchant: address, buyer: address,
  campaignId: "1", quantity: 2, reference: "Till 1", unitPrice: "25000000", token: address,
  orderHash: hash, createdAt: 100, expiresAt: 1000,
};
const order: OrderView = {
  paymentId: hash, productId: hash, productName: null, campaignId: "1", projectId: "1", projectTitle: null,
  merchant: address, buyer: address, quantity: 2, gross: "50000000", donation: "2000000", fee: "0",
  token: address, orderHash: hash, status: "Settled", txHash: hash, timestamp: 200,
  settleAfter: 200, settleTxHash: hash, refundTxHash: null,
};

describe("in-store payment requests", () => {
  it("validates a single-product checkout and its quantity", () => {
    expect(saleRequestSchema.safeParse({ campaignId: "1", quantity: 2 }).success).toBe(true);
    for (const quantity of [0, 1.5, 101, -1]) expect(saleRequestSchema.safeParse({ campaignId: "1", quantity }).success).toBe(false);
    expect(saleRequestSchema.safeParse({ campaignId: "1 or 1=1", quantity: 1 }).success).toBe(false);
  });
  it("requires exact chain-payment terms rather than a receipt screenshot", () => {
    expect(matchesStoreInvoice(invoice, order)).toBe(true);
    for (const changed of [{ quantity: 1 }, { gross: "1" }, { campaignId: "2" }, { timestamp: 1001 },
      { buyer: "0x3333333333333333333333333333333333333333" as const }, { orderHash: `0x${"44".repeat(32)}` as const },
      { token: "0x3333333333333333333333333333333333333333" as const }]) {
      expect(matchesStoreInvoice(invoice, { ...order, ...changed })).toBe(false);
    }
    expect(matchesStoreInvoice({ ...invoice, buyer: null }, order)).toBe(false);
  });
  it("preserves confirmed and refunded states after the request expires", () => {
    expect(storePaymentStatus(invoice, null, 200)).toBe("Awaiting payment");
    expect(storePaymentStatus(invoice, null, 1001)).toBe("Expired");
    expect(storePaymentStatus(invoice, order, 1001)).toBe("Payment received");
    expect(storePaymentStatus(invoice, { ...order, status: "Refunded" }, 1001)).toBe("Refunded");
  });
});