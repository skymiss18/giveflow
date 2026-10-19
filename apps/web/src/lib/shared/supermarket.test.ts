import { describe, expect, it } from "vitest";
import type { OrderView } from "./types";
import { clampQuantity, findNewSale, saleSplit } from "./supermarket";

const hash = (value: string) => `0x${value.repeat(32)}` as const;
const address = "0x1111111111111111111111111111111111111111";
const order = (overrides: Partial<OrderView>): OrderView => ({
  paymentId: hash("aa"), productId: hash("bb"), productName: null, campaignId: "1", projectId: "1", projectTitle: null,
  merchant: address, buyer: address, quantity: 2, gross: "50000000", donation: "2000000", fee: "0",
  token: address, orderHash: hash("cc"), status: "Settled", txHash: hash("dd"), timestamp: 200,
  settleAfter: 200, settleTxHash: null, refundTxHash: null, ...overrides,
});

describe("supermarket checkout demo", () => {
  it("keeps the quantity within what a single checkout accepts", () => {
    expect(clampQuantity("3")).toBe(3);
    expect(clampQuantity("2.9")).toBe(2);
    for (const value of [undefined, "", "abc", 0, -4]) expect(clampQuantity(value)).toBe(1);
    expect(clampQuantity(500)).toBe(100);
  });

  it("splits a sale like the contract does", () => {
    const fixed = { unitPrice: "25000000", fixedDonationAmount: "1000000", percentageDonationBps: 0, serviceFeeBps: 200 };
    expect(saleSplit(fixed, 2)).toEqual({ gross: 50_000_000n, donation: 2_000_000n, fee: 1_000_000n, merchant: 47_000_000n });
    const percent = { unitPrice: "10000000", fixedDonationAmount: "0", percentageDonationBps: 500, serviceFeeBps: 0 };
    expect(saleSplit(percent, 3)).toEqual({ gross: 30_000_000n, donation: 1_500_000n, fee: 0n, merchant: 28_500_000n });
  });

  it("recognises only a new order that matches the sale on screen", () => {
    const sale = { campaignId: "1", quantity: 2, gross: 50_000_000n, seen: new Set<string>() };
    const fresh = order({});
    expect(findNewSale([fresh], sale)).toBe(fresh);
    expect(findNewSale([fresh], { ...sale, seen: new Set([fresh.paymentId]) })).toBeNull();
    for (const changed of [{ quantity: 1 }, { gross: "1" }, { campaignId: "2" }]) {
      expect(findNewSale([order(changed)], sale)).toBeNull();
    }
    const newest = order({ paymentId: hash("ee") });
    expect(findNewSale([newest, fresh], sale)).toBe(newest);
  });
});
