"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { formatEther, keccak256, toBytes } from "viem";
import { useConnection, usePublicClient, useReadContract, useSignTypedData } from "wagmi";
import { apiPost } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { receiveWithAuthorizationTypedData, splitSignature } from "@/lib/client/eip3009";
import { useAction, useNow, useTx, useWalletAuth } from "@/lib/client/hooks";
import { chain } from "@/lib/client/wagmi";
import { useI18n } from "@/lib/i18n/context";
import { formatUsdc } from "@/lib/shared/format";
import type { StoreInvoice, StorePayment } from "@/lib/shared/pos";
import type { CampaignView } from "@/lib/shared/types";
import { Alert, Button, Input, TxStatus } from "./ui";

function randomOrderNonce(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function Checkout({ campaign: c, invoice, initialQuantity }: { campaign: CampaignView; invoice?: StoreInvoice; initialQuantity?: number }) {
  const { t } = useI18n();
  const { address } = useConnection();
  const publicClient = usePublicClient();
  const k = useMemo(() => contracts(), []);
  const token = useMemo(() => ({ address: c.paymentToken as `0x${string}`, abi: k.usdc.abi }), [c.paymentToken, k.usdc.abi]);
  const tx = useTx();
  const action = useAction();
  const auth = useWalletAuth();
  const { mutateAsync: signTypedData } = useSignTypedData();
  const [qty, setQty] = useState(invoice?.quantity ?? initialQuantity ?? 1);
  const [paymentId, setPaymentId] = useState<`0x${string}` | null>(null);
  const now = useNow(1000);
  const blocked = invoice && now > invoice.expiresAt ? t("This payment request has expired")
    : c.status !== "Active" ? c.status === "Superseded"
      ? t("This rule version was replaced. Open the latest version of the product from the shop.")
      : t("The merchant paused this campaign.")
    : now < c.saleStart ? t("The sale has not started yet.")
    : now > c.saleEnd ? t("The sale has ended.") : null;
  const gross = BigInt(c.unitPrice) * BigInt(qty);
  const donation = BigInt(c.fixedDonationAmount) > 0n ? BigInt(c.fixedDonationAmount) * BigInt(qty) : (gross * BigInt(c.percentageDonationBps)) / 10_000n;
  const fee = (gross * BigInt(c.serviceFeeBps)) / 10_000n;
  const merchantAmount = gross - donation - fee;
  const balance = useReadContract({
    ...token, functionName: "balanceOf", args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 6_000 },
  });
  const allowance = useReadContract({
    ...token, functionName: "allowance", args: address ? [address, k.router.address] : undefined,
    query: { enabled: !!address, refetchInterval: 6_000 },
  });
  const tokenName = useReadContract({
    ...token,
    functionName: "name",
    query: { enabled: !!address },
  });
  const tokenVersion = useReadContract({
    ...token,
    functionName: "version",
    query: { enabled: !!address },
  });
  const supportsAuthorization = tokenVersion.data === "2";
  const enoughBalance = balance.data !== undefined && balance.data >= gross;
  const approved = allowance.data !== undefined && allowance.data >= gross;
  const expiry = () => BigInt(invoice?.expiresAt ?? Math.floor(Date.now() / 1000) + 15 * 60);
  const gas = useQuery({
    queryKey: ["gas", c.campaignId, qty, address, approved, invoice?.id, supportsAuthorization],
    enabled: !!address && !!publicClient && approved && enoughBalance && !blocked && !supportsAuthorization,
    queryFn: async () => {
      const [units, price] = await Promise.all([
        publicClient!.estimateContractGas({
          ...k.router, functionName: "checkout",
          args: [c.productId, BigInt(c.campaignId), qty, c.paymentToken, invoice?.orderHash ?? keccak256(toBytes("gas-estimate")), BigInt(c.unitPrice), expiry()],
          account: address,
        }),
        publicClient!.getGasPrice(),
      ]);
      return units * price;
    },
    retry: false,
  });

  async function approve() {
    await tx.send({ ...token, functionName: "approve", args: [k.router.address, gross] });
  }

  async function pay() {
    if (!address || !publicClient) return;
    if (invoice) {
      const headers = await auth("pos:claim");
      const current = await apiPost<StorePayment>(`/api/pos/${invoice.id}`, {}, headers);
      if (current.status !== "Awaiting payment") throw new Error("This payment request is no longer payable");
    }
    const orderHash = invoice?.orderHash ?? keccak256(toBytes(`order:${randomOrderNonce()}`));
    const orderExpiry = expiry();
    const order = {
      productId: c.productId,
      campaignId: BigInt(c.campaignId),
      quantity: qty,
      paymentToken: c.paymentToken,
      orderHash,
      quotedUnitPrice: BigInt(c.unitPrice),
      orderExpiry,
    } as const;
    const id = await publicClient.readContract({ ...k.router, functionName: "paymentIdFor", args: [address, orderHash] });
    if (supportsAuthorization) {
      const nonce = await publicClient.readContract({ ...k.router, functionName: "authorizationNonce", args: [address, order] });
      const signature = await signTypedData(
        receiveWithAuthorizationTypedData({
          name: String(tokenName.data ?? "USD Coin"),
          version: String(tokenVersion.data ?? "2"),
          chainId: chain.id,
          token: c.paymentToken as `0x${string}`,
          message: {
            from: address,
            to: k.router.address,
            value: gross,
            validAfter: 0n,
            validBefore: orderExpiry,
            nonce,
          },
        }) as never,
      );
      const { v, r, s } = splitSignature(signature);
      const relayed = await apiPost<{ hash: `0x${string}` }>("/api/relay/checkout", {
        buyer: address,
        order: {
          ...order,
          campaignId: order.campaignId.toString(),
          quotedUnitPrice: order.quotedUnitPrice.toString(),
          orderExpiry: order.orderExpiry.toString(),
        },
        authorization: { validAfter: "0", validBefore: orderExpiry.toString(), v, r, s },
      });
      await tx.track(relayed.hash);
    } else {
      await tx.send({
        ...k.router, functionName: "checkout",
        args: [c.productId, BigInt(c.campaignId), qty, c.paymentToken, orderHash, BigInt(c.unitPrice), orderExpiry],
      });
    }
    setPaymentId(id);
  }

  if (paymentId && tx.status === "success") {
    return (
      <div className="mt-4 space-y-3">
        <Alert tone="good">
          <p className="font-medium">{t("Payment confirmed.")}</p>
          <p className="mt-1">{formatUsdc(donation)} mUSDC {c.refundWindow > 0 ? t("will be donated once the refund window ends.") : t("was donated to the charity treasury in the same transaction.")}</p>
        </Alert>
        <Link href={`/orders/${paymentId}`} className="block"><Button className="w-full">{t("View your proof")}</Button></Link>
        {!invoice && <Button variant="secondary" className="w-full" onClick={() => { tx.reset(); setPaymentId(null); }}>{t("Buy again")}</Button>}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">{t("Quantity")}</span>
        <Input type="number" min={1} max={100} value={qty} disabled={!!invoice} onChange={(event) => setQty(Math.max(1, Math.min(100, Math.trunc(Number(event.target.value)) || 1)))} />
      </label>
      <div className="space-y-1.5 rounded-lg bg-mint-soft p-3 text-sm">
        <Line label={t("You pay")} value={`${formatUsdc(gross)} mUSDC`} strong />
        <Line label={t("→ Charity treasury")} value={formatUsdc(donation)} />
        <Line label={t("→ Merchant")} value={formatUsdc(merchantAmount)} />
        <Line label={t("→ Platform fee")} value={formatUsdc(fee)} />
        <div className="border-t border-ink/10 pt-1.5 text-xs text-ink-soft">
          {t("Network:")} {chain.name}.{" "}
          {gas.data ? t("Estimated network fee ≈ {value0} ETH.", { value0: Number(formatEther(gas.data)).toFixed(6) }) : t("Network fee is estimated when the wallet asks for payment confirmation.")}
        </div>
      </div>
      <div className="text-xs text-ink-soft">
        {t("Your balance:")} {balance.data !== undefined ? `${formatUsdc(balance.data)} mUSDC` : "…"}
        {balance.data !== undefined && !enoughBalance && <> — <Link href="/faucet" className="underline">{t("get test tokens")}</Link></>}
      </div>
      {blocked && <Alert tone="warn">{blocked}</Alert>}
      {supportsAuthorization && !blocked && (
        <Button className="w-full" disabled={tx.busy || action.pending || !enoughBalance} onClick={() => void action.run(pay)}>
          {t("Pay")} {formatUsdc(gross)} mUSDC
        </Button>
      )}
      {!supportsAuthorization && !blocked && !approved && <Button className="w-full" disabled={tx.busy || !enoughBalance} onClick={() => void approve().catch(() => undefined)}>{t("1. Approve")} {formatUsdc(gross)} mUSDC</Button>}
      {!supportsAuthorization && !blocked && approved && <Button className="w-full" disabled={tx.busy || action.pending || !enoughBalance} onClick={() => void action.run(pay)}>2. {t("Pay")} {formatUsdc(gross)} mUSDC</Button>}
      <TxStatus tx={tx} />
      {action.error && <Alert tone="bad">{action.error}</Alert>}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}><span>{label}</span><span>{value}</span></div>;
}