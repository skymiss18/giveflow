"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Minus, Plus, QrCode, Store } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { useNow } from "@/lib/client/hooks";
import { useI18n } from "@/lib/i18n/context";
import { formatUsdc } from "@/lib/shared/format";
import { clampQuantity, findNewSale, MAX_ITEMS, saleSplit, STORES, STORE_TABS, type StoreKey } from "@/lib/shared/supermarket";
import type { CampaignView, OrderView } from "@/lib/shared/types";
import { donationLabel } from "@/components/campaign-card";
import { PaymentCode } from "@/components/payment-code";
import { AddressLink, Alert, Badge, Button, Card, EmptyState, ErrorNote, Loading, PageHeader, SectionTitle, TxLink } from "@/components/ui";

type Sale = { campaignId: string; quantity: number; seen: Set<string> };

export default function SupermarketPage() {
  const { t } = useI18n();
  const now = useNow(1000);
  const [store, setStore] = useState<StoreKey>("Supermarket");
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [sale, setSale] = useState<Sale | null>(null);
  const products = useApi<CampaignView[]>("/api/data/campaigns");
  const shelf = (products.data ?? []).filter((c) => c.isLatest && c.status === "Active" && now >= c.saleStart && now < c.saleEnd);
  const campaign = sale
    ? products.data?.find((c) => c.campaignId === sale.campaignId)
    : shelf.find((c) => c.campaignId === selectedId) ?? shelf[0];
  const orders = useApi<OrderView[]>(campaign ? `/api/data/orders?campaignId=${campaign.campaignId}` : null, 3000);
  const split = campaign ? saleSplit(campaign, sale?.quantity ?? quantity) : null;
  const paid = sale && split && orders.data ? findNewSale(orders.data, { ...sale, gross: split.gross }) : null;
  const { name, till } = STORES[store];

  function showQr() {
    if (!campaign || !orders.data) return;
    setSale({ campaignId: campaign.campaignId, quantity, seen: new Set(orders.data.map((order) => order.paymentId.toLowerCase())) });
  }

  return (
    <>
      <PageHeader
        title={t("Supermarket checkout")}
        subtitle={t("Demo cashier screen. Charity products that merchants publish are sold in supermarkets and malls; customers scan the QR code with a phone wallet to pay.")}
      />
      <StoreTabs store={store} onChange={setStore} disabled={!!sale} />
      {products.isLoading && <Loading />}
      {products.error && <ErrorNote error={products.error} />}
      {products.data && shelf.length === 0 && !sale && (
        <EmptyState title={t("No products yet")}>{t("Merchants can publish products from the Merchant console.")}</EmptyState>
      )}
      {campaign && split && (
        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          <section>
            <SectionTitle>{t("Charity products on the shelf")}</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {(sale ? [campaign] : shelf).map((item) => (
                <button
                  key={item.campaignId}
                  type="button"
                  aria-pressed={item.campaignId === campaign.campaignId}
                  disabled={!!sale}
                  onClick={() => setSelectedId(item.campaignId)}
                  className={`rounded-2xl border bg-paper p-4 text-left transition disabled:cursor-not-allowed ${item.campaignId === campaign.campaignId ? "border-ink ring-2 ring-mint" : "border-line hover:bg-mint-soft"}`}
                >
                  {item.meta?.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.meta.imageUrl} alt="" className="mb-3 h-32 w-full rounded-xl object-cover" />
                  )}
                  <div className="font-semibold">{item.meta?.name ?? t("Product")}</div>
                  <div className="mt-1 text-sm text-ink-soft">{item.merchantName ?? t("Merchant")}</div>
                  <div className="mt-3 text-xl font-semibold">{formatUsdc(item.unitPrice)} <span className="text-sm font-normal">mUSDC</span></div>
                  <div className="mt-2 rounded-lg bg-mint-soft px-2.5 py-1.5 text-xs">{donationLabel(item, t)}</div>
                </button>
              ))}
            </div>
          </section>

          <section className="lg:sticky lg:top-28 lg:self-start">
            <Card className="overflow-hidden p-0">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-ink px-5 py-3 text-cream">
                <div className="flex items-center gap-2 font-medium"><Store size={18} aria-hidden="true" />{t(name)}</div>
                <div className="text-xs">{t(till)}</div>
              </div>
              <div className="space-y-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{campaign.meta?.name ?? t("Product")}</div>
                    <div className="text-sm text-ink-soft">{campaign.projectTitle ?? t("Project #{value0}", { value0: campaign.projectId })}</div>
                  </div>
                  <Badge>{t("Test tokens only")}</Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">{t("Quantity")}</span>
                  <div className="inline-flex items-center gap-1">
                    <Button variant="secondary" className="h-9 w-9 px-0" aria-label={t("Decrease quantity")} disabled={!!sale || quantity <= 1} onClick={() => setQuantity(clampQuantity(quantity - 1))}><Minus size={16} aria-hidden="true" /></Button>
                    <span className="w-10 text-center text-lg font-semibold">{sale?.quantity ?? quantity}</span>
                    <Button variant="secondary" className="h-9 w-9 px-0" aria-label={t("Increase quantity")} disabled={!!sale || quantity >= MAX_ITEMS} onClick={() => setQuantity(clampQuantity(quantity + 1))}><Plus size={16} aria-hidden="true" /></Button>
                  </div>
                </div>
                <div className="space-y-1.5 rounded-lg bg-mint-soft p-3 text-sm">
                  <Line label={t("Total paid")} value={`${formatUsdc(split.gross)} mUSDC`} strong />
                  <Line label={t("→ Charity treasury")} value={formatUsdc(split.donation)} />
                  <Line label={t("→ Merchant")} value={formatUsdc(split.merchant)} />
                  <Line label={t("→ Platform fee")} value={formatUsdc(split.fee)} />
                </div>

                {!sale && (
                  <Button className="w-full" disabled={!orders.data} onClick={showQr}><QrCode size={16} aria-hidden="true" />{t("Show payment QR")}</Button>
                )}
                {orders.error && <ErrorNote error={orders.error} />}

                {sale && !paid && (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Badge tone="warn">{t("Awaiting payment")}</Badge>
                      <span className="text-xs text-ink-soft">{t("Customers scan with their phone, choose a wallet and confirm the payment.")}</span>
                    </div>
                    <PaymentCode path={`/shop/${sale.campaignId}?qty=${sale.quantity}`} label={t("Scan to pay")} size={220} />
                    <Button variant="secondary" className="w-full" onClick={() => setSale(null)}>{t("Cancel")}</Button>
                  </>
                )}

                {paid && (
                  <>
                    <Alert tone="good">
                      <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={20} aria-hidden="true" />{t("Payment received")}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">{t("Buyer")} <AddressLink address={paid.buyer} /></div>
                      <div className="mt-1"><TxLink hash={paid.txHash} /></div>
                    </Alert>
                    <Link href={`/orders/${paid.paymentId}`} className="block text-sm underline">{t("View your proof")}</Link>
                    <Button className="w-full" onClick={() => setSale(null)}>{t("Next customer")}</Button>
                  </>
                )}
              </div>
            </Card>
          </section>
        </div>
      )}
    </>
  );
}

function StoreTabs({ store, onChange, disabled }: { store: StoreKey; onChange: (store: StoreKey) => void; disabled: boolean }) {
  const { t } = useI18n();
  return (
    <div role="group" aria-label={t("Store")} className="mb-6 flex flex-wrap gap-2">
      {STORE_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          aria-pressed={tab === store}
          disabled={disabled && tab !== store}
          onClick={() => onChange(tab)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${tab === store ? "bg-ink text-cream" : "border border-line bg-paper hover:bg-mint-soft"}`}
        >
          {t(tab)}
        </button>
      ))}
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}><span>{label}</span><span>{value}</span></div>;
}
