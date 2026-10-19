import type { CampaignView, OrderView } from "./types";

export const MAX_ITEMS = 100;

export const STORE_TABS = ["Supermarket", "Mall"] as const;
export type StoreKey = (typeof STORE_TABS)[number];

export const STORES: Record<StoreKey, { name: string; till: string }> = {
  Supermarket: { name: "GiveFlow Fresh Supermarket", till: "Lane 3" },
  Mall: { name: "GiveFlow City Mall", till: "Counter 12" },
};

export function clampQuantity(value: unknown): number {
  const quantity = Math.trunc(Number(value));
  return Number.isFinite(quantity) ? Math.max(1, Math.min(MAX_ITEMS, quantity)) : 1;
}

type Pricing = Pick<CampaignView, "unitPrice" | "fixedDonationAmount" | "percentageDonationBps" | "serviceFeeBps">;

export function saleSplit(campaign: Pricing, quantity: number) {
  const gross = BigInt(campaign.unitPrice) * BigInt(quantity);
  const donation = BigInt(campaign.fixedDonationAmount) > 0n
    ? BigInt(campaign.fixedDonationAmount) * BigInt(quantity)
    : (gross * BigInt(campaign.percentageDonationBps)) / 10_000n;
  const fee = (gross * BigInt(campaign.serviceFeeBps)) / 10_000n;
  return { gross, donation, fee, merchant: gross - donation - fee };
}

/** Returns the newest order of this sale that was not on chain when the QR code was shown. */
export function findNewSale(
  orders: readonly OrderView[],
  sale: { campaignId: string; quantity: number; gross: bigint; seen: ReadonlySet<string> },
): OrderView | null {
  return orders.find((order) =>
    !sale.seen.has(order.paymentId.toLowerCase()) &&
    order.campaignId === sale.campaignId &&
    order.quantity === sale.quantity &&
    BigInt(order.gross) === sale.gross) ?? null;
}
