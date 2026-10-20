import type EthereumProvider from "@walletconnect/ethereum-provider";
import { getAddress, isAddress, isAddressEqual, toHex, type Address, type Hex, type PublicClient } from "viem";
import { apiGet, apiPost } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { receiveWithAuthorizationTypedData, splitSignature } from "@/lib/client/eip3009";
import { createWalletLogger } from "@/lib/client/wallet-logger";
import { authMessage } from "@/lib/shared/auth";
import type { StoreInvoice, StorePayment } from "@/lib/shared/pos";
import type { CampaignView } from "@/lib/shared/types";

type PaymentTerms = Pick<CampaignView, "campaignId" | "merchant" | "unitPrice" | "paymentToken" | "status" | "saleStart" | "saleEnd">;

export function assertStoreWalletTerms(invoice: StoreInvoice, campaign: PaymentTerms, chainId: number, router: Address, now: number) {
  if (invoice.chainId !== chainId || !isAddressEqual(invoice.router, router) ||
    invoice.campaignId !== campaign.campaignId || invoice.unitPrice !== campaign.unitPrice ||
    !isAddressEqual(invoice.token, campaign.paymentToken) || !isAddressEqual(invoice.merchant, campaign.merchant)) {
    throw new Error("Payment request does not match this product");
  }
  if (now > invoice.expiresAt) throw new Error("This payment request has expired");
  if (campaign.status !== "Active" || now < campaign.saleStart || now > campaign.saleEnd) {
    throw new Error("This product is not available for sale");
  }
}

export function assertStoreWalletIdentity(invoice: StoreInvoice, buyer: Address, chainId: number) {
  if (chainId !== invoice.chainId) throw new Error("Customer wallet is on the wrong network");
  if (invoice.buyer && !isAddressEqual(invoice.buyer, buyer)) {
    throw new Error("This payment request is assigned to another wallet");
  }
}

export type CustomerProvider = Pick<EthereumProvider, "accounts" | "chainId" | "request">;
type PaymentClient = Pick<PublicClient, "readContract" | "waitForTransactionReceipt">;
export type StoreWalletProgress = "Authorizing order" | "Submitting payment" | "Waiting for chain receipt" | "Verifying payment";

export async function createStoreWalletProvider(invoice: StoreInvoice, rpcUrl: string, onUri: (uri: string) => void) {
  const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  if (!projectId) throw new Error("Wallet APP checkout requires a WalletConnect Project ID");
  const { EthereumProvider } = await import("@walletconnect/ethereum-provider");
  const values = new Map<string, unknown>();
  const provider = await EthereumProvider.init({
    projectId,
    chains: [invoice.chainId],
    methods: ["personal_sign", "eth_signTypedData_v4"],
    optionalMethods: [],
    events: ["accountsChanged", "chainChanged"],
    optionalEvents: [],
    showQrModal: false,
    disableProviderPing: true,
    logger: createWalletLogger(),
    customStoragePrefix: `giveflow:pos:${invoice.id}:${crypto.randomUUID()}`,
    storage: {
      async getKeys() { return [...values.keys()]; },
      async getEntries<Value>() { return [...values.entries()] as [string, Value][]; },
      async getItem<Value>(key: string) { return values.get(key) as Value | undefined; },
      async setItem<Value>(key: string, value: Value) { values.set(key, value); },
      async removeItem(key: string) { values.delete(key); },
    },
    rpcMap: { [invoice.chainId]: rpcUrl },
    metadata: { name: "GiveFlow", description: "In-store payment", url: window.location.origin, icons: [] },
  });
  provider.on("display_uri", onUri);
  return provider;
}

export async function disposeStoreWalletProvider(provider: EthereumProvider) {
  provider.events.removeAllListeners();
  provider.signer.abortPairingAttempt();
  if (provider.session) await provider.disconnect().catch(() => undefined);
  await provider.signer.cleanupPendingPairings({ deletePairings: true }).catch(() => undefined);
}

export function storeWalletBuyer(provider: CustomerProvider): Address {
  const account = provider.accounts[0];
  if (!account || !isAddress(account)) throw new Error("Customer wallet is disconnected");
  return getAddress(account);
}

export async function payWithStoreWallet(options: {
  provider: CustomerProvider;
  publicClient: PaymentClient;
  invoice: StoreInvoice;
  campaign: CampaignView;
  buyer: Address;
  isActive: () => boolean;
  onProgress: (progress: StoreWalletProgress, hash?: Hex) => void;
}) {
  const { provider, publicClient, campaign, buyer, isActive, onProgress } = options;
  const configured = contracts();
  let invoice = options.invoice;
  const token = { address: invoice.token, abi: configured.usdc.abi };
  const now = () => Math.floor(Date.now() / 1000);

  function guard() {
    if (!isActive()) throw new Error("Wallet checkout was cancelled");
    assertStoreWalletTerms(invoice, campaign, configured.deployment.chainId, configured.router.address, now());
    assertStoreWalletIdentity(invoice, storeWalletBuyer(provider), provider.chainId);
    if (!isAddressEqual(storeWalletBuyer(provider), buyer)) throw new Error("Customer wallet changed. Scan again.");
  }

  async function currentOrder() {
    guard();
    const current = await apiGet<StorePayment>(`/api/pos/${invoice.id}`);
    guard();
    if (current.status !== "Awaiting payment") throw new Error("This payment request is no longer payable");
    invoice = current.invoice;
    guard();
  }

  guard();
  await currentOrder();
  const latestCampaign = await apiGet<CampaignView>(`/api/data/campaigns/${invoice.campaignId}`);
  guard();
  assertStoreWalletTerms(invoice, latestCampaign, configured.deployment.chainId, configured.router.address, now());

  onProgress("Authorizing order");
  const issued = now();
  const signature = await provider.request<Hex>({
    method: "personal_sign",
    params: [toHex(authMessage("pos:claim", buyer, issued, invoice.chainId)), buyer],
  }, 300);
  guard();
  const headers = { "x-auth-address": buyer, "x-auth-issued": String(issued), "x-auth-signature": signature };
  const claimed = await apiPost<StorePayment>(`/api/pos/${invoice.id}`, {}, headers);
  guard();
  invoice = claimed.invoice;
  guard();
  if (claimed.status !== "Awaiting payment") throw new Error("This payment request is no longer payable");

  const gross = BigInt(invoice.unitPrice) * BigInt(invoice.quantity);
  const balance = await publicClient.readContract({ ...token, functionName: "balanceOf", args: [buyer] });
  guard();
  if (balance < gross) throw new Error("Insufficient token balance.");

  const orderExpiry = BigInt(invoice.expiresAt);
  const order = {
    productId: campaign.productId,
    campaignId: BigInt(invoice.campaignId),
    quantity: invoice.quantity,
    paymentToken: invoice.token,
    orderHash: invoice.orderHash,
    quotedUnitPrice: BigInt(invoice.unitPrice),
    orderExpiry,
  } as const;

  const [tokenName, tokenVersion, nonce] = await Promise.all([
    publicClient.readContract({ ...token, functionName: "name" }),
    publicClient.readContract({ ...token, functionName: "version" }),
    publicClient.readContract({ ...configured.router, functionName: "authorizationNonce", args: [buyer, order] }),
  ]);
  guard();

  const authzSig = await provider.request<Hex>({
    method: "eth_signTypedData_v4",
    params: [
      buyer,
      JSON.stringify(receiveWithAuthorizationTypedData({
        name: String(tokenName),
        version: String(tokenVersion),
        chainId: invoice.chainId,
        token: invoice.token,
        message: {
          from: buyer,
          to: invoice.router,
          value: gross,
          validAfter: 0n,
          validBefore: orderExpiry,
          nonce,
        },
      }), (_key, value) => typeof value === "bigint" ? value.toString() : value),
    ],
  }, 300);
  guard();
  const { v, r, s } = splitSignature(authzSig);

  onProgress("Submitting payment");
  const relayed = await apiPost<{ hash: Hex }>("/api/relay/checkout", {
    buyer,
    order: {
      ...order,
      campaignId: order.campaignId.toString(),
      quotedUnitPrice: order.quotedUnitPrice.toString(),
      orderExpiry: order.orderExpiry.toString(),
    },
    authorization: { validAfter: "0", validBefore: orderExpiry.toString(), v, r, s },
  });
  guard();
  onProgress("Waiting for chain receipt", relayed.hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: relayed.hash, timeout: 180_000 });
  guard();
  if (receipt.status !== "success") throw new Error("Transaction reverted on-chain");
  const hash = relayed.hash;
  onProgress("Verifying payment", hash);
  return hash;
}