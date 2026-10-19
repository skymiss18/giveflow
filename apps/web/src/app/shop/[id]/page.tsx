"use client";

import { useI18n } from "@/lib/i18n/context";

import Link from "next/link";
import { use } from "react";
import { useApi } from "@/lib/client/api";
import { bpsToPercent, formatUsdc } from "@/lib/shared/format";
import { hashMetadata } from "@/lib/shared/metadata";
import { clampQuantity } from "@/lib/shared/supermarket";
import type { CampaignView } from "@/lib/shared/types";
import { Checkout } from "@/components/checkout";
import { PaymentCode } from "@/components/payment-code";
import { donationLabel } from "@/components/campaign-card";
import { RequireWallet } from "@/components/wallet";
import {
  AddressLink,
  Badge,
  Card,
  ErrorNote,
  HashText,
  Loading,
  SectionTitle,
  statusTone,
} from "@/components/ui";

export default function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ qty?: string }> }) {
  const { t, formatDate, formatDuration } = useI18n();
  const { id } = use(params);
  const { qty } = use(searchParams);
  const { data: c, isLoading, error } = useApi<CampaignView>(`/api/data/campaigns/${id}`);

  if (isLoading) return <Loading />;
  if (error || !c) return <ErrorNote error={error ?? new Error("Campaign not found")} />;

  const metaVerified = c.meta ? hashMetadata("product", c.meta) === c.metadataHash : false;

  return (
    <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <Link href="/shop" className="underline">
             {t("Shop")} </Link>
          <span>/</span>
          <span>{c.merchantName ?? t("Merchant")}</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{c.meta?.name ?? t("Product")}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge tone={statusTone(c.status)}>{t(c.status)}</Badge>
          <Badge>{t("Rules v")}{c.ruleVersion}</Badge>
          {metaVerified && <Badge tone="good">{t("Description matches on-chain hash")}</Badge>}
        </div>
        {c.meta?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.meta.imageUrl} alt="" className="mt-6 max-h-80 w-full rounded-2xl object-cover" />
        )}
        {c.meta?.description && <p className="mt-6 whitespace-pre-line">{c.meta.description}</p>}

        <SectionTitle>{t("The promise, enforced by the contract")}</SectionTitle>
        <Card className="space-y-3 text-sm">
          <Row label={t("Donation rule")}>
            <b>{donationLabel(c, t)}</b>
          </Row>
          <Row label={t("Charity project")}>
            <Link href={`/projects/${c.projectId}`} className="underline">
              {c.projectTitle ?? t("Project #{value0}", { value0: c.projectId })}
            </Link>
          </Row>
          <Row label={t("Charity treasury")}>
            <AddressLink address={c.charityTreasury} />
          </Row>
          <Row label={t("Merchant payout")}>
            <AddressLink address={c.merchantReceiver} />
          </Row>
          <Row label={t("Platform fee")}>{bpsToPercent(c.serviceFeeBps)}</Row>
          <Row label={t("Refund window")}>
            {c.refundWindow > 0 ? t("{value0} — funds stay in escrow, then split automatically", { value0: formatDuration(c.refundWindow) }) : t("None — the split happens in the same transaction")}
          </Row>
          <Row label={t("Sale period")}>
            {formatDate(c.saleStart)} → {formatDate(c.saleEnd)}
          </Row>
          {BigInt(c.maxDonation) > 0n && <Row label={t("Donation cap")}>{formatUsdc(c.maxDonation)} mUSDC</Row>}
          <Row label={t("Campaign / product id")}>
            #{c.campaignId} · <HashText value={c.productId} />
          </Row>
        </Card>
        <SectionTitle>{t("Product QR")}</SectionTitle>
        <PaymentCode path={`/shop/${c.campaignId}`} label={t("Scan to pay")} />
      </div>

      <div className="lg:sticky lg:top-28 lg:self-start">
        <Card>
          <div className="text-3xl font-semibold">
            {formatUsdc(c.unitPrice)} <span className="text-base font-normal">mUSDC</span>
          </div>
          <RequireWallet message={t("Connect a wallet to buy. You can get free test tokens from the Faucet.")}>
            {() => <Checkout campaign={c} initialQuantity={qty ? clampQuantity(qty) : undefined} />}
          </RequireWallet>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-line/60 pb-2 last:border-0 last:pb-0">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

