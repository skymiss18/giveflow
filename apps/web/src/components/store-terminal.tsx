"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Globe, QrCode, Smartphone } from "lucide-react";
import { apiPost, useApi } from "@/lib/client/api";
import { useAction, useNow, useWalletAuth } from "@/lib/client/hooks";
import { chain } from "@/lib/client/wagmi";
import { useI18n } from "@/lib/i18n/context";
import { formatUsdc } from "@/lib/shared/format";
import type { StoreInvoice, StorePayment } from "@/lib/shared/pos";
import type { CampaignView } from "@/lib/shared/types";
import { PaymentCode } from "./payment-code";
import { StoreWalletCheckout } from "./store-wallet-checkout";
import { AddressLink, Alert, Badge, Button, Card, ErrorNote, Field, Input, Select, TxLink } from "./ui";

export function StoreTerminal({ campaigns }: { campaigns: CampaignView[] }) {
  const { t, formatDate } = useI18n();
  const now = useNow(1000);
  const available = campaigns.filter((campaign) => campaign.status === "Active" && now >= campaign.saleStart && now < campaign.saleEnd);
  const [selected, setSelected] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [reference, setReference] = useState("");
  const [invoice, setInvoice] = useState<StoreInvoice | null>(null);
  const [mode, setMode] = useState<"web" | "wallet">("web");
  const auth = useWalletAuth();
  const action = useAction();
  const payment = useApi<StorePayment>(invoice ? `/api/pos/${invoice.id}` : null, 3000);
  const campaign = invoice ? campaigns.find((item) => item.campaignId === invoice.campaignId)
    : available.find((item) => item.campaignId === (selected || available[0]?.campaignId));
  const selectable = invoice && campaign ? [campaign] : available;
  const status = payment.data?.order ? payment.data.status : invoice && now > invoice.expiresAt ? "Expired" : payment.data?.status ?? "Awaiting payment";

  async function generate() {
    await action.run(async () => {
      if (!campaign) throw new Error("Choose a product and a quantity from 1 to 100");
      const headers = await auth("pos:create");
      setInvoice(await apiPost<StoreInvoice>("/api/pos", { campaignId: campaign.campaignId, quantity, reference }, headers));
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">{t("In-store checkout")}</h2>
        <div className="flex flex-wrap gap-2"><Badge>{chain.name}</Badge><Badge>{t("Test tokens only")}</Badge></div>
        <Field label={t("Product")}>
          <Select value={campaign?.campaignId ?? ""} onChange={(event) => setSelected(event.target.value)} disabled={!!invoice}>
            {selectable.map((item) => <option key={item.campaignId} value={item.campaignId}>{item.meta?.name ?? t("Product")} - {formatUsdc(item.unitPrice)} mUSDC</option>)}
          </Select>
        </Field>
        <Field label={t("Quantity")}>
          <Input type="number" min={1} max={100} value={quantity} disabled={!!invoice} onChange={(event) => setQuantity(Math.max(1, Math.min(100, Math.trunc(Number(event.target.value)) || 1)))} />
        </Field>
        <Field label={t("Store reference (optional)")} hint={t("Public order reference only. Do not include personal data.")}>
          <Input maxLength={80} value={reference} disabled={!!invoice} onChange={(event) => setReference(event.target.value)} />
        </Field>
        <div className="flex items-baseline justify-between border-y border-line py-4">
          <span className="text-sm text-ink-soft">{t("Total paid")}</span>
          <strong className="text-2xl">{formatUsdc(invoice ? BigInt(invoice.unitPrice) * BigInt(invoice.quantity) : campaign ? BigInt(campaign.unitPrice) * BigInt(quantity) : 0n)} mUSDC</strong>
        </div>
        {action.error && <Alert tone="bad">{action.error}</Alert>}
        {!invoice && <Button disabled={!campaign || action.pending} onClick={() => void generate()}><QrCode size={16} aria-hidden="true" />{t("Create payment QR")}</Button>}
        {invoice && <Button variant="secondary" onClick={() => setInvoice(null)}>{t("New checkout")}</Button>}
      </section>
      <section className="space-y-4">
        {invoice && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={status === "Payment received" ? "good" : status === "Expired" || status === "Refunded" ? "bad" : "warn"}>{t(status)}</Badge>
              <span className="text-xs text-ink-soft">{t("Expires {date}", { date: formatDate(invoice.expiresAt) })}</span>
            </div>
            {status === "Awaiting payment" && (
              <>
                <div role="group" aria-label={t("Payment mode")} className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-line bg-mint-soft p-1">
                  <button type="button" aria-pressed={mode === "web"} onClick={() => setMode("web")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm ${mode === "web" ? "bg-paper shadow-sm" : "text-ink-soft"}`}><Globe size={16} aria-hidden="true" />{t("Web QR")}</button>
                  <button type="button" aria-pressed={mode === "wallet"} onClick={() => setMode("wallet")} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm ${mode === "wallet" ? "bg-paper shadow-sm" : "text-ink-soft"}`}><Smartphone size={16} aria-hidden="true" />{t("Wallet APP QR")}</button>
                </div>
                {mode === "web" ? <PaymentCode path={`/pay/${invoice.id}`} label={t("Scan to pay")} />
                  : campaign && <StoreWalletCheckout key={invoice.id} invoice={payment.data?.invoice ?? invoice} campaign={campaign} />}
              </>
            )}
            {payment.error && <ErrorNote error={payment.error} />}
            {payment.data?.order && (
              <Card className="space-y-3">
                <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={20} aria-hidden="true" />{t(status)}</div>
                <div className="text-sm">{t("Buyer")} <AddressLink address={payment.data.order.buyer} /></div>
                <TxLink hash={payment.data.order.txHash} />
                <Link href={`/orders/${payment.data.order.paymentId}`} className="block text-sm underline">{t("View your proof")}</Link>
              </Card>
            )}
          </>
        )}
        {campaign && !invoice && <PaymentCode path={`/shop/${campaign.campaignId}`} label={t("Product QR")} />}
      </section>
    </div>
  );
}