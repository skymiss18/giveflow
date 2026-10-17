"use client";

import Link from "next/link";
import { use } from "react";
import { useConnection } from "wagmi";
import { apiPost, useApi } from "@/lib/client/api";
import { useAction, useNow, useWalletAuth } from "@/lib/client/hooks";
import { chain } from "@/lib/client/wagmi";
import { useI18n } from "@/lib/i18n/context";
import { formatUsdc } from "@/lib/shared/format";
import type { StorePayment } from "@/lib/shared/pos";
import type { CampaignView } from "@/lib/shared/types";
import { RequireWallet } from "@/components/wallet";
import { AddressLink, Alert, Badge, Button, Card, ErrorNote, Loading, PageHeader, TxLink } from "@/components/ui";
import { Checkout } from "@/components/checkout";

export default function StorePaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const payment = useApi<StorePayment>(`/api/pos/${id}`, 3000);
  const campaign = useApi<CampaignView>(payment.data ? `/api/data/campaigns/${payment.data.invoice.campaignId}` : null);
  if (payment.isLoading || campaign.isLoading) return <Loading />;
  if (payment.error || campaign.error) return <ErrorNote error={payment.error ?? campaign.error} />;
  if (!payment.data || !campaign.data) return <Loading />;
  const { invoice, status, order } = payment.data;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader title={t("In-store payment")} subtitle={campaign.data.merchantName ?? t("Merchant")} />
      <div className="flex flex-wrap gap-2"><Badge>{chain.name}</Badge><Badge>{t("Test tokens only")}</Badge><Badge>{t(status)}</Badge></div>
      <div className="border-y border-line py-5">
        <h2 className="text-xl font-semibold">{campaign.data.meta?.name ?? t("Product")}</h2>
        <div className="mt-2 flex items-baseline justify-between gap-3">
          <span className="text-sm text-ink-soft">{t("Quantity")} {invoice.quantity}</span>
          <strong className="text-2xl">{formatUsdc(BigInt(invoice.unitPrice) * BigInt(invoice.quantity))} mUSDC</strong>
        </div>
        {invoice.reference && <div className="mt-2 break-words text-sm">{t("Store reference")} {invoice.reference}</div>}
        <div className="mt-2 text-xs text-ink-soft">{t("Merchant payout")} <AddressLink address={campaign.data.merchantReceiver} /></div>
      </div>
      {order ? (
        <Card className="space-y-3">
          <div className="font-semibold">{t(status)}</div>
          <TxLink hash={order.txHash} />
          <Link href={`/orders/${order.paymentId}`} className="block underline">{t("View your proof")}</Link>
        </Card>
      ) : status === "Expired" ? <Alert tone="warn">{t("This payment request has expired")}</Alert> : (
        <RequireWallet>{() => <InvoiceCheckout key={invoice.id} payment={payment.data} campaign={campaign.data!} />}</RequireWallet>
      )}
    </div>
  );
}

function InvoiceCheckout({ payment, campaign }: { payment: StorePayment; campaign: CampaignView }) {
  const { t, formatDate } = useI18n();
  const { address } = useConnection();
  const action = useAction();
  const auth = useWalletAuth();
  const now = useNow(1000);
  const { invoice } = payment;
  const mismatch = invoice.campaignId !== campaign.campaignId || invoice.unitPrice !== campaign.unitPrice ||
    invoice.token.toLowerCase() !== campaign.paymentToken.toLowerCase() || invoice.merchant.toLowerCase() !== campaign.merchant.toLowerCase();
  if (mismatch) return <Alert tone="bad">{t("Payment request does not match this product")}</Alert>;
  if (now > invoice.expiresAt) return <Alert tone="warn">{t("This payment request has expired")}</Alert>;
  if (invoice.buyer && invoice.buyer.toLowerCase() !== address?.toLowerCase()) {
    return <Alert tone="warn">{t("This payment request is assigned to another wallet")}</Alert>;
  }
  if (invoice.buyer) return <Checkout campaign={campaign} invoice={invoice} />;

  return (
    <div className="space-y-3">
      <div className="text-sm text-ink-soft">{t("Expires {date}", { date: formatDate(invoice.expiresAt) })}</div>
      {action.error && <Alert tone="bad">{action.error}</Alert>}
      <Button disabled={action.pending} onClick={() => void action.run(async () => {
        const headers = await auth("pos:claim");
        await apiPost(`/api/pos/${invoice.id}`, {}, headers);
      })}>{t("Continue with this wallet")}</Button>
    </div>
  );
}