"use client";

import { useI18n } from "@/lib/i18n/context";

import Link from "next/link";
import { use } from "react";
import { useApi } from "@/lib/client/api";
import { formatUsdc } from "@/lib/shared/format";
import type { ProjectDetail } from "@/lib/shared/types";
import {
  AddressLink,
  Badge,
  Card,
  EmptyState,
  ErrorNote,
  HashText,
  Loading,
  PageHeader,
  SectionTitle,
  Stat,
  statusTone,
  TxLink,
} from "@/components/ui";

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { t, formatDate } = useI18n();
  const { id } = use(params);
  const { data: p, isLoading, error } = useApi<ProjectDetail>(`/api/data/projects/${id}`);
  if (isLoading) return <Loading />;
  if (error || !p) return <ErrorNote error={error ?? new Error("Project not found")} />;

  const target = BigInt(p.targetAmount);
  const received = BigInt(p.received);
  const pct = target > 0n ? Math.min(100, Number((received * 100n) / target)) : 0;

  return (
    <>
      <PageHeader
        title={p.meta?.title ?? t("Project #{value0}", { value0: p.projectId })}
        subtitle={
          <>
            {p.charityName ?? t("Charity")} · {t(p.meta?.category ?? "General")}
            {p.meta?.location && <> · {p.meta.location}</>}
          </>
        }
        actions={<Badge tone={statusTone(p.status)}>{t(p.status)}</Badge>}
      />
      {p.meta?.summary && <p className="mb-6 max-w-3xl">{p.meta.summary}</p>}
      {p.meta?.usage && (
        <Card className="mb-6 max-w-3xl">
          <div className="text-xs font-medium uppercase tracking-wide text-ink-soft">{t("How donations will be used")}</div>
          <p className="mt-1 whitespace-pre-line text-sm">{p.meta.usage}</p>
        </Card>
      )}

      <Card>
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label={t("Received")} value={`${formatUsdc(p.received)}`} sub={t("goal {value0} mUSDC", { value0: formatUsdc(p.targetAmount) })} />
          <Stat label={t("In escrow")} value={formatUsdc(p.pending)} sub={t("released after refund window")} />
          <Stat label={t("Treasury balance")} value={formatUsdc(p.treasuryBalance)} />
          <Stat label={t("Evidence verified")} value={`${p.evidence.verified}/${p.evidence.submitted}`} />
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-coral" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
          <span>
             {t("Treasury:")} <AddressLink address={p.treasury} />
          </span>
          <span>
             {t("Charity wallet:")} <AddressLink address={p.charity} />
          </span>
        </div>
      </Card>

      <SectionTitle hint={p.latestReport ? t("v{value0} published {value1}", { value0: p.latestReport.version, value1: formatDate(p.latestReport.publishedAt) }) : undefined}>
         {t("Impact report")} </SectionTitle>
      {p.latestReport ? (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
             {t("Report hash")} <HashText value={p.latestReport.reportHash} />  {t("is recorded on-chain. The page recomputes it from the stored snapshot.")} </div>
          <Link href={`/reports/${p.projectId}`} className="rounded-full bg-ink px-4 py-2 text-sm font-medium text-cream hover:bg-ink-soft">
             {t("Open report")} </Link>
        </Card>
      ) : (
        <EmptyState title={t("No report published yet")} />
      )}

      <SectionTitle hint={t("Files stay private; only their fingerprints are public")}>{t("Delivery evidence")}</SectionTitle>
      {p.evidenceList.length === 0 ? (
        <EmptyState title={t("No evidence registered yet")} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-ink-soft">
              <tr>
                <th className="px-4 py-3">{t("Type")}</th>
                <th className="px-4 py-3">{t("Fingerprint")}</th>
                <th className="px-4 py-3">{t("Submitted")}</th>
                <th className="px-4 py-3">{t("Status")}</th>
                <th className="px-4 py-3">{t("Verifier")}</th>
                <th className="px-4 py-3">{t("Tx")}</th>
              </tr>
            </thead>
            <tbody>
              {p.evidenceList.map((e) => (
                <tr key={e.evidenceId} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">{t(e.kind)}</td>
                  <td className="px-4 py-3">
                    <HashText value={e.contentHash} />
                  </td>
                  <td className="px-4 py-3">{formatDate(e.submittedAt)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(e.status)}>{t(e.status)}</Badge>
                  </td>
                  <td className="px-4 py-3">{e.verifier ? <AddressLink address={e.verifier} /> : "—"}</td>
                  <td className="px-4 py-3">
                    <TxLink hash={e.txHash} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionTitle hint={t("Buyer addresses are pseudonymous")}>{t("Donations from purchases")}</SectionTitle>
      {p.orderList.length === 0 ? (
        <EmptyState title={t("No purchases yet")} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs uppercase text-ink-soft">
              <tr>
                <th className="px-4 py-3">{t("Product")}</th>
                <th className="px-4 py-3">{t("Donation")}</th>
                <th className="px-4 py-3">{t("Status")}</th>
                <th className="px-4 py-3">{t("When")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {p.orderList.map((o) => (
                <tr key={o.paymentId} className="border-b border-line/60 last:border-0">
                  <td className="px-4 py-3">
                    {o.productName ?? `#${o.campaignId}`} × {o.quantity}
                  </td>
                  <td className="px-4 py-3">{formatUsdc(o.donation)}</td>
                  <td className="px-4 py-3">
                    <Badge tone={statusTone(o.status)}>{t(o.status)}</Badge>
                  </td>
                  <td className="px-4 py-3">{formatDate(o.timestamp)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/orders/${o.paymentId}`} className="underline">
                       {t("Proof")} </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
