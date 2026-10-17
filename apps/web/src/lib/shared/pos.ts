import { z } from "zod";
import type { Hex, OrderView } from "./types";

export const saleRequestSchema = z.object({
  campaignId: z.string().regex(/^\d{1,18}$/),
  quantity: z.number().int().min(1).max(100),
  reference: z.string().trim().max(80).default(""),
});

export type StoreInvoice = {
  id: string;
  chainId: number;
  router: Hex;
  merchant: Hex;
  campaignId: string;
  quantity: number;
  reference: string;
  unitPrice: string;
  token: Hex;
  orderHash: Hex;
  createdAt: number;
  expiresAt: number;
  buyer: Hex | null;
};

export type StorePayment = {
  invoice: StoreInvoice;
  order: OrderView | null;
  status: "Awaiting payment" | "Payment received" | "Refunded" | "Expired";
};

export function matchesStoreInvoice(invoice: StoreInvoice, order: OrderView): boolean {
  return !!invoice.buyer &&
    order.buyer.toLowerCase() === invoice.buyer.toLowerCase() &&
    order.merchant.toLowerCase() === invoice.merchant.toLowerCase() &&
    order.orderHash.toLowerCase() === invoice.orderHash.toLowerCase() &&
    order.campaignId === invoice.campaignId &&
    order.quantity === invoice.quantity &&
    order.token.toLowerCase() === invoice.token.toLowerCase() &&
    BigInt(order.gross) === BigInt(invoice.unitPrice) * BigInt(invoice.quantity) &&
    order.timestamp >= invoice.createdAt && order.timestamp <= invoice.expiresAt;
}

export function storePaymentStatus(invoice: StoreInvoice, order: OrderView | null, now: number): StorePayment["status"] {
  if (order && matchesStoreInvoice(invoice, order)) return order.status === "Refunded" ? "Refunded" : "Payment received";
  return now > invoice.expiresAt ? "Expired" : "Awaiting payment";
}