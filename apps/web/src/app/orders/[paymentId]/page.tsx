"use client";

import { useI18n } from "@/lib/i18n/context";

import Link from "next/link";
import { use, useMemo } from "react";
import { useConnection } from "wagmi";
import { useApi } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { useTx, useNow } from "@/lib/client/hooks";
import { formatUsdc } from "@/lib/shared/format";
import type { OrderView } from "@/lib/shared/types";
import { stringToHex } from "viem";
import {
  Alert,
  AddressLink,
  Badge,
  Button,
  Card,
  ErrorNote,
  HashText,
  Loading,
  PageHeader,
  SectionTitle,
  statusTone,
  TxLink,
  TxStatus,
} from "@/components/ui";

export default function OrderProofPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { t, formatDate } = useI18n();
  const { paymentId } = use(params);
  const { data: o, isLoading, error } = useApi<OrderView>(`/api/data/orders/${paymentId}`);
  const { address } = useConnection();
  const tx = useTx();
  const now = useNow();
  const k = useMemo(() => contracts(), []);

  if (isLoading) return <Loading />;
  if (error || !o) return <ErrorNote error={error ?? new Error("Order not found")} />;

  const me = address?.toLowerCase();
  const isBuyer = me === o.buyer.toLowerCase();
  const isMerchant = me === o.merchant.toLowerCase();
  const escrowed = o.status === "Escrowed";
  const canRefund = escrowed && ((isBuyer && now < o.settleAfter) || isMerchant);
  const canSettle = escrowed && now >= o.settleAfter;
  const merchantAmount = BigInt(o.gross) - BigInt(o.donation) - BigInt(o.fee);

  const steps = [
    { done: true, title: t("Payment received"), detail: <TxLink hash={o.txHash} />, at: o.timestamp },
    o.status === "Refunded"
      ? { done: true, title: t("Refunded to buyer"), detail: o.refundTxHash && <TxLink hash={o.refundTxHash} />, at: undefined }
      : escrowed
        ? { done: false, title: t("Held in escrow"), detail: t("Splits automatically after {value0}", { value0: formatDate(o.settleAfter) }), at: undefined }
        : { done: true, title: t("Split on-chain"), detail: o.settleTxHash && <TxLink hash={o.settleTxHash} />, at: undefined },
  ];

  return (
    <>
      <PageHeader
        title={t("Proof of purchase and donation")}
        subtitle={t("Anyone can check this page against the blockchain. Nothing here depends on the platform's word.")}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm text-ink-soft">{t("Product")}</div>
              <div className="text-xl font-semibold">{o.productName ?? t("Campaign #{value0}", { value0: o.campaignId })}</div>
            </div>
            <Badge tone={statusTone(o.status)}>{t(o.status)}</Badge>
          </div>
          <dl className="mt-5 space-y-2 text-sm">
            <Item label={t("Quantity")}>{o.quantity}</Item>
            <Item label={t("Total paid")}>{formatUsdc(o.gross)} mUSDC</Item>
            <Item label={t("→ Charity treasury")}>{formatUsdc(o.donation)} mUSDC</Item>
            <Item label={t("→ Merchant")}>{formatUsdc(merchantAmount)} mUSDC</Item>
            <Item label={t("→ Platform fee")}>{formatUsdc(o.fee)} mUSDC</Item>
            <Item label={t("Buyer")}>
              <AddressLink address={o.buyer} />
            </Item>
            <Item label={t("Payment id")}>
              <HashText value={o.paymentId} />
            </Item>
            <Item label={t("Order hash")}>
              <HashText value={o.orderHash} />
            </Item>
          </dl>
        </Card>

        <div className="space-y-6">
          <Card>
            <div className="mb-3 font-semibold">{t("Where the money went")}</div>
            <ol className="space-y-4">
              {steps.map((s) => (
                <li key={s.title} className="flex gap-3">
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${s.done ? "bg-coral" : "border-2 border-gold"}`} />
                  <div>
                    <div className="font-medium">{s.title}</div>
                    <div className="text-sm text-ink-soft">
                      {s.detail}
                      {s.at && <span> · {formatDate(s.at)}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          <Card>
            <div className="font-semibold">{t("Follow the donation")}</div>
            <p className="mt-1 text-sm text-ink-soft">
              {formatUsdc(o.donation)}  {t("mUSDC supports")} <b>{o.projectTitle ?? t("project #{value0}", { value0: o.projectId })}</b>.
            </p>
            <Link href={`/projects/${o.projectId}`}>
              <Button variant="secondary" className="mt-3">
                 {t("See delivery evidence")} </Button>
            </Link>
          </Card>

          {(canRefund || canSettle) && (
            <Card className="space-y-3">
              {canRefund && (
                <Button
                  variant="danger"
                  disabled={tx.busy}
                  onClick={() =>
                    void tx.send({ ...k.router, functionName: "refund", args: [o.paymentId, stringToHex("requested", { size: 32 })] }).catch(() => undefined)
                  }
                >
                   {t("Refund")} {formatUsdc(o.gross)} mUSDC
                </Button>
              )}
              {canSettle && (
                <Button disabled={tx.busy} onClick={() => void tx.send({ ...k.router, functionName: "settle", args: [o.paymentId] }).catch(() => undefined)}>
                   {t("Settle now (anyone can do this)")} </Button>
              )}
              <TxStatus tx={tx} />
            </Card>
          )}
          {escrowed && !canRefund && !canSettle && isBuyer && <Alert>{t("The refund window has ended; the split will run once someone settles it.")}</Alert>}
        </div>
      </div>
      <SectionTitle>{t("Verify it yourself")}</SectionTitle>
      <p className="text-sm text-ink-soft">
         {t("Open the payment transaction above in a block explorer and look for the")} <code className="font-mono">PurchaseCompleted</code>  {t("and")}{" "}
        <code className="font-mono">DonationReceived</code>  {t("events. The amounts must equal the ones shown here.")} </p>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-b border-line/60 pb-2 last:border-0 last:pb-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
