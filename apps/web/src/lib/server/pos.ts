import { randomUUID } from "node:crypto";
import { encodeAbiParameters, keccak256, toBytes } from "viem";
import { getDeployment } from "@/lib/shared/chain";
import { saleRequestSchema, storePaymentStatus, type StoreInvoice, type StorePayment } from "@/lib/shared/pos";
import type { Hex } from "@/lib/shared/types";
import { CHAIN_ID } from "./chain";
import { getDb } from "./db";
import { HttpError } from "./http";
import { getCampaign, getOrders, getParties } from "./queries";

function database() {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS store_invoices (
    id TEXT PRIMARY KEY, chain_id INTEGER NOT NULL, router TEXT NOT NULL,
    data TEXT NOT NULL, buyer TEXT
  )`);
  return db;
}

export function loadStoreInvoice(id: string): StoreInvoice {
  const row = database().prepare("SELECT data, buyer FROM store_invoices WHERE id = ? AND chain_id = ? AND router = ?")
    .get(id, CHAIN_ID, getDeployment().CheckoutRouter.toLowerCase()) as { data: string; buyer: Hex | null } | undefined;
  if (!row) throw new HttpError(404, "Payment request not found");
  return { ...JSON.parse(row.data), buyer: row.buyer } as StoreInvoice;
}

export async function createStoreInvoice(wallet: Hex, input: unknown): Promise<StoreInvoice> {
  const parsed = saleRequestSchema.safeParse(input);
  if (!parsed.success) throw new HttpError(400, "Choose a product and a quantity from 1 to 100");
  const { campaignId, quantity, reference } = parsed.data;
  const campaign = await getCampaign(campaignId);
  const party = (await getParties("merchant", wallet))[0];
  if (!campaign || campaign.merchant.toLowerCase() !== wallet.toLowerCase() || party?.status !== "Approved") {
    throw new HttpError(403, "Only the approved product merchant can create a payment request");
  }
  const now = Math.floor(Date.now() / 1000);
  if (campaign.status !== "Active" || now < campaign.saleStart || now >= campaign.saleEnd) {
    throw new HttpError(409, "This product is not available for sale");
  }
  if (campaign.paymentToken.toLowerCase() !== getDeployment().MockUSDC.toLowerCase()) {
    throw new HttpError(409, "This payment token is not allowed.");
  }
  const id = randomUUID();
  const invoice: StoreInvoice = {
    id, chainId: CHAIN_ID, router: getDeployment().CheckoutRouter, merchant: wallet,
    campaignId, quantity, reference, unitPrice: campaign.unitPrice, token: campaign.paymentToken,
    orderHash: keccak256(toBytes(`giveflow:store:${CHAIN_ID}:${id}`)), createdAt: now,
    expiresAt: Math.min(now + 900, campaign.saleEnd), buyer: null,
  };
  database().prepare("INSERT INTO store_invoices (id, chain_id, router, data) VALUES (?, ?, ?, ?)")
    .run(id, CHAIN_ID, invoice.router.toLowerCase(), JSON.stringify(invoice));
  return invoice;
}

export async function getStorePayment(id: string): Promise<StorePayment> {
  const invoice = loadStoreInvoice(id);
  const paymentId = invoice.buyer ? keccak256(encodeAbiParameters(
    [{ type: "uint256" }, { type: "address" }, { type: "address" }, { type: "bytes32" }],
    [BigInt(invoice.chainId), invoice.router, invoice.buyer, invoice.orderHash],
  )) : null;
  const order = paymentId ? (await getOrders({ paymentId }))[0] ?? null : null;
  const status = storePaymentStatus(invoice, order, Math.floor(Date.now() / 1000));
  return { invoice, order: status === "Payment received" || status === "Refunded" ? order : null, status };
}

export async function claimStoreInvoice(id: string, buyer: Hex): Promise<StorePayment> {
  const invoice = loadStoreInvoice(id);
  if (Math.floor(Date.now() / 1000) > invoice.expiresAt) throw new HttpError(409, "This payment request has expired");
  database().prepare("UPDATE store_invoices SET buyer = ? WHERE id = ? AND buyer IS NULL").run(buyer, id);
  if (loadStoreInvoice(id).buyer?.toLowerCase() !== buyer.toLowerCase()) {
    throw new HttpError(409, "This payment request is assigned to another wallet");
  }
  return getStorePayment(id);
}