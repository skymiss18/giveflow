"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, Minus, Package, Plus, ReceiptText, ScanLine, Store, Wifi } from "lucide-react";
import { useApi } from "@/lib/client/api";
import { useNow } from "@/lib/client/hooks";
import { useI18n } from "@/lib/i18n/context";
import { formatUsdc } from "@/lib/shared/format";
import { clampQuantity, findNewSale, MAX_ITEMS, saleSplit, STORES } from "@/lib/shared/supermarket";
import type { CampaignView, OrderView } from "@/lib/shared/types";
import { donationLabel } from "@/components/campaign-card";
import { PaymentCode } from "@/components/payment-code";
import { AddressLink, Alert, Badge, Button, EmptyState, ErrorNote, Loading, TxLink } from "@/components/ui";

type Sale = { campaignId: string; quantity: number; seen: Set<string> };

const STEP_BUTTON = "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-ink/40 bg-paper text-ink transition hover:bg-mint-soft disabled:cursor-not-allowed disabled:opacity-40";

export default function SupermarketPage() {
  const { t, locale, locales, setLocale, localeLabel } = useI18n();
  const now = useNow(1000);
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [sale, setSale] = useState<Sale | null>(null);
  const products = useApi<CampaignView[]>("/api/data/campaigns");
  const shelf = (products.data ?? []).filter((c) => c.isLatest && c.status === "Active" && now >= c.saleStart && now < c.saleEnd);
  const itemCount = shelf.length;
  const campaign = shelf.find((c) => c.campaignId === selectedId) ?? shelf[0];
  const campaignId = campaign?.campaignId;
  const orders = useApi<OrderView[]>(campaign ? `/api/data/orders?campaignId=${campaign.campaignId}` : null, 3000);
  const split = campaign ? saleSplit(campaign, quantity) : null;
  const saleReady = sale !== null && sale.campaignId === campaignId && sale.quantity === quantity;
  const paid = saleReady && split && orders.data ? findNewSale(orders.data, { ...sale, gross: split.gross }) : null;
  const { name, till } = STORES.Supermarket;
  const [clock, setClock] = useState("");

  useEffect(() => {
    const updateClock = () => setClock(new Intl.DateTimeFormat(locale === "zh" ? "zh-SG" : "en-SG", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date()));
    updateClock();
    const interval = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(interval);
  }, [locale]);

  useEffect(() => {
    if (!campaignId || !orders.data) return;
    setSale((current) => {
      if (current?.campaignId === campaignId && current.quantity === quantity) return current;
      return { campaignId, quantity, seen: new Set(orders.data.map((order) => order.paymentId.toLowerCase())) };
    });
  }, [campaignId, orders.data, quantity]);

  return (
    <div className="min-h-screen bg-[#e9eee8] pb-8">
      <div className="border-b border-[#d9ded6] bg-white">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/" aria-label={t("Back to GiveFlow")} title={t("Back to GiveFlow")} className="inline-flex h-9 items-center gap-2 rounded px-2 font-semibold hover:bg-[#f2f5ef] focus-visible:outline-2 focus-visible:outline-ink">
              <ArrowLeft size={17} aria-hidden="true" />GiveFlow
            </Link>
            <span className="hidden h-6 border-l border-[#d9ded6] sm:block" aria-hidden="true" />
            <span className="hidden text-sm text-ink-soft sm:inline">{t("Point of sale")}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="grid h-9 grid-cols-[58px_42px] gap-0.5 rounded-md border border-[#d9ded6] bg-[#f2f5ef] p-0.5 text-xs">
              {locales.map((next) => (
                <button key={next} type="button" onClick={() => setLocale(next)} aria-pressed={next === locale} className={`rounded px-2 transition-colors focus-visible:outline-2 focus-visible:outline-ink ${next === locale ? "bg-white font-semibold text-ink shadow-sm" : "text-ink-soft hover:bg-white/70"}`}>
                  {localeLabel(next)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <header className="border-y border-[#d9ded6] bg-[#f2f5ef]">
        <div className="mx-auto max-w-screen-2xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink text-cream"><Store size={20} aria-hidden="true" /></div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">{t(name)}</h1>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-soft"><span>{t(till)}</span><span aria-hidden="true">·</span><span>{t("POS terminal 03")}</span></div>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs sm:gap-5">
              <span className="inline-flex items-center gap-1.5 text-ink-soft"><Clock3 size={15} aria-hidden="true" />{clock || "--:--:--"}<span className="hidden sm:inline">{t("Singapore time")}</span></span>
              <span className="inline-flex items-center gap-1.5 font-medium text-[#28734c]"><span className="h-2 w-2 rounded-full bg-[#43a66b]" />{t("Terminal online")}</span>
            </div>
          </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#d9ded6] pt-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-ink-soft"><ScanLine size={16} aria-hidden="true" />{t("Register")}</div>
            <Badge>{t("Test tokens only")}</Badge>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
        {products.isLoading && <Loading />}
        {products.error && <ErrorNote error={products.error} />}
        {products.data && shelf.length === 0 && (
          <EmptyState title={t("No products yet")}>{t("Merchants can publish products from the Merchant console.")}</EmptyState>
        )}
        {campaign && split && (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.9fr)]">
            <section aria-labelledby="register-items" className="min-w-0">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 id="register-items" className="text-lg font-semibold">{t("Available items")}</h2>
                  <p className="mt-0.5 text-xs text-ink-soft">{t("Select a shelf item to ring it up")}</p>
                </div>
                  <span className="text-xs text-ink-soft">{t(itemCount === 1 ? "1 item" : "{count} items", { count: itemCount })}</span>
              </div>
              <div className="divide-y divide-[#e2e6df] border-y border-[#d9ded6] bg-paper">
                {shelf.map((item) => (
                  <button
                    key={item.campaignId}
                    type="button"
                    aria-pressed={item.campaignId === campaign.campaignId}
                    disabled={!!paid}
                    onClick={() => setSelectedId(item.campaignId)}
                    className={`grid w-full grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left transition sm:grid-cols-[76px_minmax(0,1fr)_auto] sm:gap-4 sm:px-4 ${item.campaignId === campaign.campaignId ? "bg-[#eaf4ed]" : "hover:bg-[#f5f7f2]"} disabled:cursor-not-allowed`}
                  >
                    <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-md bg-[#edf1e9] sm:h-[72px] sm:w-[72px]">
                      {item.meta?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.meta.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : <Package size={25} strokeWidth={1.5} className="text-ink-soft" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{item.meta?.name ?? t("Product")}</div>
                      <div className="mt-1 truncate text-xs text-ink-soft">{item.merchantName ?? t("Merchant")}<span aria-hidden="true"> · </span>{item.projectTitle ?? t("Project #{value0}", { value0: item.projectId })}</div>
                      <div className="mt-2 line-clamp-1 text-[11px] text-[#28734c]">{donationLabel(item, t)}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-base font-semibold tabular-nums">{formatUsdc(item.unitPrice)}</div>
                      <div className="text-[11px] text-ink-soft">mUSDC</div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-ink-soft"><Wifi size={14} aria-hidden="true" />{t("Connected to store catalogue")}</div>
            </section>

            <aside aria-label={t("Sales receipt")} className="overflow-hidden border border-[#d9ded6] bg-paper shadow-sm lg:sticky lg:top-24">
              <div className="flex items-center justify-between bg-ink px-4 py-3 text-cream">
                <div className="flex items-center gap-2"><ReceiptText size={18} aria-hidden="true" /><span className="font-semibold">{t("Sales receipt")}</span></div>
                <span className="font-mono text-xs opacity-80">{t("SALE")}</span>
              </div>
              <div className="space-y-4 p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3 border-b border-dashed border-[#d9ded6] pb-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{campaign.meta?.name ?? t("Product")}</div>
                    <div className="mt-1 text-xs text-ink-soft">{campaign.projectTitle ?? t("Project #{value0}", { value0: campaign.projectId })}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 text-sm">
                  <div><div className="font-medium">{t("Quantity")}</div><div className="mt-0.5 text-xs text-ink-soft">{formatUsdc(campaign.unitPrice)} mUSDC {t("each")}</div></div>
                  <div className="inline-flex items-center gap-2">
                    <button type="button" className={STEP_BUTTON} aria-label={t("Decrease quantity")} disabled={!!paid || quantity <= 1} onClick={() => setQuantity(clampQuantity(quantity - 1))}><Minus size={18} strokeWidth={2.5} aria-hidden="true" /></button>
                    <span className="w-8 text-center font-mono text-lg font-semibold tabular-nums">{quantity}</span>
                    <button type="button" className={STEP_BUTTON} aria-label={t("Increase quantity")} disabled={!!paid || quantity >= MAX_ITEMS} onClick={() => setQuantity(clampQuantity(quantity + 1))}><Plus size={18} strokeWidth={2.5} aria-hidden="true" /></button>
                  </div>
                </div>

                <div className="space-y-2 border-t border-dashed border-[#d9ded6] pt-3 text-sm">
                  <Line label={t("Subtotal")} value={`${formatUsdc(split.gross)} mUSDC`} />
                  <Line label={t("→ Charity treasury")} value={formatUsdc(split.donation)} />
                  <Line label={t("→ Merchant")} value={formatUsdc(split.merchant)} />
                  <Line label={t("→ Platform fee")} value={formatUsdc(split.fee)} />
                </div>

                <div className="flex items-end justify-between border-y border-[#d9ded6] bg-[#f4f6f1] px-3 py-3">
                  <div><div className="text-xs font-medium uppercase text-ink-soft">{t("Total due")}</div><div className="mt-1 text-[11px] text-ink-soft">{t("Pay with mUSDC")}</div></div>
                  <div className="text-right"><div className="font-mono text-2xl font-bold tabular-nums">{formatUsdc(split.gross)}</div><div className="text-xs font-medium text-ink-soft">mUSDC</div></div>
                </div>

                {orders.error && <ErrorNote error={orders.error} />}

                {saleReady && !paid && (
                  <div className="space-y-3 border-t border-dashed border-[#d9ded6] pt-4">
                    <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-2 text-sm font-semibold text-[#9a6700]"><span className="h-2 w-2 animate-pulse rounded-full bg-[#d99b21]" />{t("Awaiting payment")}</span><span className="text-xs text-ink-soft">{t("Scan to pay")}</span></div>
                    <PaymentCode path={`/shop/${campaign.campaignId}?qty=${quantity}`} label={t("Scan to pay")} size={180} />
                  </div>
                )}

                {paid && (
                  <div className="space-y-3 border-t border-dashed border-[#d9ded6] pt-4">
                    <Alert tone="good">
                      <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={20} aria-hidden="true" />{t("Payment received")}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2">{t("Buyer")} <AddressLink address={paid.buyer} /></div>
                      <div className="mt-1"><TxLink hash={paid.txHash} /></div>
                    </Alert>
                    <Link href={`/orders/${paid.paymentId}`} className="block text-sm underline">{t("View your proof")}</Link>
                    <Button className="w-full rounded-md" onClick={() => { setSale(null); setQuantity(1); }}>{t("Next customer")}</Button>
                  </div>
                )}
              </div>
              <div className="border-t border-[#d9ded6] bg-[#f7f8f5] px-4 py-2 text-center text-[10px] text-ink-soft">{t("THANK YOU · HAVE A NICE DAY")}</div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return <div className={`flex justify-between ${strong ? "font-semibold" : ""}`}><span>{label}</span><span>{value}</span></div>;
}
