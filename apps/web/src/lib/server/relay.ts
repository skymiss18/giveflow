import { getAddress, http, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createWalletClient } from "viem";
import { checkoutRouterAbi } from "@/contracts/abis";
import { getDeployment } from "@/lib/shared/chain";
import { CHAIN_ID, chain, publicClient } from "./chain";
import { getDb } from "./db";
import { HttpError } from "./http";

type OrderInput = {
  productId: Hex;
  campaignId: string;
  quantity: number;
  paymentToken: Address;
  orderHash: Hex;
  quotedUnitPrice: string;
  orderExpiry: string;
};

type AuthorizationInput = { validAfter: string; validBefore: string; v: number; r: Hex; s: Hex };
type RelayInput = { buyer: Address; order: OrderInput; authorization: AuthorizationInput };

const HEX32 = /^0x[0-9a-fA-F]{64}$/;
const UINT = /^\d{1,20}$/;
const WINDOW_SECONDS = 60;
const BUYER_LIMIT = 3;
const IP_LIMIT = 12;

function normalizedAddress(value: unknown): Address {
  if (typeof value !== "string" || !isAddress(value)) throw new HttpError(400, "Invalid wallet");
  return getAddress(value);
}

function decimal(value: unknown, name: string, maxDigits = 20): string {
  if (typeof value !== "string" || value.length > maxDigits || !UINT.test(value)) throw new HttpError(400, `Invalid ${name}`);
  return value;
}

function parseInput(value: unknown): RelayInput {
  if (!value || typeof value !== "object") throw new HttpError(400, "Invalid relay request");
  const body = value as Record<string, unknown>;
  const order = body.order as Record<string, unknown> | null;
  const authorization = body.authorization as Record<string, unknown> | null;
  if (!order || typeof order !== "object" || !authorization || typeof authorization !== "object") {
    throw new HttpError(400, "Invalid relay request");
  }
  if (typeof order.productId !== "string" || !HEX32.test(order.productId) ||
      typeof order.orderHash !== "string" || !HEX32.test(order.orderHash)) {
    throw new HttpError(400, "Invalid order hash");
  }
  if (!Number.isInteger(order.quantity) || Number(order.quantity) < 1 || Number(order.quantity) > 100) {
    throw new HttpError(400, "Invalid quantity");
  }
  if (!Number.isInteger(authorization.v) || ![27, 28].includes(Number(authorization.v)) ||
      typeof authorization.r !== "string" || !HEX32.test(authorization.r) ||
      typeof authorization.s !== "string" || !HEX32.test(authorization.s)) {
    throw new HttpError(400, "Invalid wallet signature");
  }
  return {
    buyer: normalizedAddress(body.buyer),
    order: {
      productId: order.productId as Hex,
      campaignId: decimal(order.campaignId, "campaign id"),
      quantity: Number(order.quantity),
      paymentToken: normalizedAddress(order.paymentToken),
      orderHash: order.orderHash as Hex,
      quotedUnitPrice: decimal(order.quotedUnitPrice, "quoted price"),
      orderExpiry: decimal(order.orderExpiry, "order expiry"),
    },
    authorization: {
      validAfter: decimal(authorization.validAfter, "authorization start"),
      validBefore: decimal(authorization.validBefore, "authorization expiry"),
      v: Number(authorization.v),
      r: authorization.r as Hex,
      s: authorization.s as Hex,
    },
  };
}

function allowedValues(envName: string): string[] {
  return (process.env[envName] ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
}

function enforceAllowlist(input: RelayInput) {
  const tokens = allowedValues("RELAY_ALLOWED_TOKENS");
  const campaigns = allowedValues("RELAY_ALLOWED_CAMPAIGNS");
  if (tokens.length === 0 || campaigns.length === 0) throw new HttpError(503, "Checkout relayer is not configured");
  if (!tokens.includes(input.order.paymentToken.toLowerCase())) throw new HttpError(403, "Payment token is not enabled for relaying");
  if (!campaigns.includes("*") && !campaigns.includes(input.order.campaignId)) throw new HttpError(403, "Campaign is not enabled for relaying");
  if (input.order.paymentToken.toLowerCase() !== getDeployment().MockUSDC.toLowerCase() && process.env.RELAY_ALLOW_EXTERNAL_TOKENS !== "1") {
    throw new HttpError(403, "External payment tokens are disabled for relaying");
  }
}

function consumeRateLimit(key: string, limit: number, now: number) {
  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS relay_rate_limits (
    bucket TEXT NOT NULL, window_start INTEGER NOT NULL, hits INTEGER NOT NULL,
    PRIMARY KEY (bucket, window_start)
  )`);
  const windowStart = Math.floor(now / WINDOW_SECONDS) * WINDOW_SECONDS;
  db.prepare("DELETE FROM relay_rate_limits WHERE window_start < ?").run(windowStart - WINDOW_SECONDS * 2);
  const result = db.prepare(`
    INSERT INTO relay_rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
    ON CONFLICT(bucket, window_start) DO UPDATE SET hits = hits + 1
    RETURNING hits
  `).get(key, windowStart) as { hits: number };
  if (result.hits > limit) throw new HttpError(429, "Checkout relayer rate limit exceeded");
}

function requestIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return req.headers.get("x-real-ip")?.trim() || forwarded || "unknown";
}

export async function relayCheckout(req: Request, raw: unknown) {
  const key = process.env.RELAYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new HttpError(503, "Checkout relayer is not configured");
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) {
    throw new HttpError(403, "Cross-origin relay requests are not allowed");
  }
  const input = parseInput(raw);
  enforceAllowlist(input);
  const current = Math.floor(Date.now() / 1000);
  consumeRateLimit("global", 10, current);
  consumeRateLimit(`buyer:${input.buyer.toLowerCase()}`, BUYER_LIMIT, current);
  consumeRateLimit(`ip:${requestIp(req)}`, IP_LIMIT, current);

  if (CHAIN_ID !== Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111)) throw new HttpError(503, "Relayer chain configuration mismatch");
  const deployment = getDeployment();
  const account = privateKeyToAccount(key as Hex);
  const walletClient = createWalletClient({ account, chain, transport: http(process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || undefined) });
  const args = [
    input.buyer,
    {
      productId: input.order.productId,
      campaignId: BigInt(input.order.campaignId),
      quantity: input.order.quantity,
      paymentToken: input.order.paymentToken,
      orderHash: input.order.orderHash,
      quotedUnitPrice: BigInt(input.order.quotedUnitPrice),
      orderExpiry: BigInt(input.order.orderExpiry),
    },
    {
      validAfter: BigInt(input.authorization.validAfter),
      validBefore: BigInt(input.authorization.validBefore),
      v: input.authorization.v,
      r: input.authorization.r,
      s: input.authorization.s,
    },
  ] as const;
  const request = {
    address: deployment.CheckoutRouter,
    abi: checkoutRouterAbi,
    functionName: "checkoutWithAuthorization" as const,
    args,
    account,
  };

  await publicClient.simulateContract(request);
  const estimate = await publicClient.estimateContractGas(request);
  // Sepolia charges ~3x Foundry's local gas for this call (measured ~1.37M), so the ceiling must sit well above 1.65M.
  const maxGas = BigInt(process.env.RELAYER_MAX_GAS ?? "2500000");
  const gas = estimate + estimate / 5n;
  if (gas > maxGas) throw new HttpError(400, "Checkout exceeds the relayer gas limit");
  const hash = await walletClient.writeContract({ ...request, gas });
  return { hash, buyer: input.buyer, relayer: account.address };
}