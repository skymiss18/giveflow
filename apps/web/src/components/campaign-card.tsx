"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { bpsToPercent, formatUsdc } from "@/lib/shared/format";
import type { CampaignView } from "@/lib/shared/types";
import { Badge, Card, statusTone } from "./ui";

type Translator = (key: string, vars?: Record<string, string | number>) => string;

export function donationLabel(c: Pick<CampaignView, "fixedDonationAmount" | "percentageDonationBps">, t?: Translator): string {
  return BigInt(c.fixedDonationAmount) > 0n
    ? (t ? t("{amount} mUSDC per item", { amount: formatUsdc(c.fixedDonationAmount) }) : `${formatUsdc(c.fixedDonationAmount)} mUSDC per item`)
    : (t ? t("{percent} of sales", { percent: bpsToPercent(c.percentageDonationBps) }) : `${bpsToPercent(c.percentageDonationBps)} of sales`);
}

export function CampaignCard({ campaign: c }: { campaign: CampaignView }) {
  const { t, statusLabel } = useI18n();

  return (
    <Link href={`/shop/${c.campaignId}`} className="block">
      <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
        {c.meta?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.meta.imageUrl} alt="" className="mb-4 h-40 w-full rounded-xl object-cover" />
        )}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{c.meta?.name ?? t("Product {id}", { id: c.productId.slice(0, 8) })}</h3>
          <Badge tone={statusTone(c.status)}>{statusLabel(c.status)}</Badge>
        </div>
        <div className="mt-1 text-sm text-ink-soft">{c.merchantName ?? t("Merchant")}</div>
        <div className="mt-4 text-2xl font-semibold">
          {formatUsdc(c.unitPrice)} <span className="text-sm font-normal">mUSDC</span>
        </div>
        <div className="mt-3 rounded-xl bg-mint-soft px-3 py-2 text-sm">
          {t("Donates")} <b>{donationLabel(c, t)}</b>
          {c.projectTitle && <> {t("to {project}", { project: c.projectTitle })}</>}
        </div>
        <div className="mt-3 text-xs text-ink-soft">
          {c.stats.units} {t("sold")} · {formatUsdc(c.stats.donated)} {t("donated")} · {t("rules v{version}", { version: c.ruleVersion })}
        </div>
      </Card>
    </Link>
  );
}
