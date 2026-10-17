"use client";

import { useI18n } from "@/lib/i18n/context";

import { use, useState } from "react";
import { useApi } from "@/lib/client/api";
import { formatUsdc } from "@/lib/shared/format";
import type { PublishedReport, ProjectDetail } from "@/lib/shared/types";
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
  Stat,
  statusTone,
  TxLink,
} from "@/components/ui";

export default function ReportPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { t, formatDate } = useI18n();
  const { projectId } = use(params);
  const project = useApi<ProjectDetail>(`/api/data/projects/${projectId}`);
  const [version, setVersion] = useState<number | null>(null);
  const q = version ? `?version=${version}` : "";
  const { data, isLoading, error } = useApi<PublishedReport>(`/api/data/reports/${projectId}${q}`);

  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorNote error={error ?? new Error("No report")} />;
  const s = data.snapshot;
  const versions = project.data?.reports.map((r) => r.version) ?? [];

  return (
    <>
      <PageHeader
        title={s ? t("Impact report: {value0}", { value0: s.project.title }) : t("Impact report")}
        subtitle={t("Version {value0} · published {value1}", { value0: data.ref.version, value1: formatDate(data.ref.publishedAt) })}
        actions={
          <div className="flex items-center gap-2 print:hidden">
            {versions.length > 1 && (
              <select
                className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
                value={data.ref.version}
                onChange={(e) => setVersion(Number(e.target.value))}
              >
                {versions.map((v) => (
                  <option key={v} value={v}>
                    {t("Version {version}", { version: v })}
                  </option>
                ))}
              </select>
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              {t("Print / save PDF")}
            </Button>
          </div>
        }
      />

      <Alert tone={data.hashMatches ? "good" : "bad"}>
        {data.hashMatches ? (
          <>
            <b>{t("Integrity verified.")}</b>  {t("The stored snapshot hashes to")} <HashText value={data.ref.reportHash} />{t(", exactly the value recorded on-chain.")} </>
        ) : (
          <>
            <b>{t("Integrity check failed.")}</b>  {t("The stored snapshot does not match the on-chain hash")} <HashText value={data.ref.reportHash} />{t(". Do not rely on this report.")} </>
        )}
      </Alert>

      {s && (
        <>
          <Card className="mt-6">
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label={t("Orders")} value={s.totals.orders} sub={t("{value0} items", { value0: s.totals.units })} />
              <Stat label={t("Gross sales")} value={formatUsdc(s.totals.gross)} />
              <Stat label={t("Donations settled")} value={formatUsdc(s.totals.donationsSettled)} sub={t("{value0} pending", { value0: formatUsdc(s.totals.donationsPending) })} />
              <Stat label={t("Disbursed")} value={formatUsdc(s.totals.disbursed)} sub={t("balance {value0}", { value0: formatUsdc(s.totals.treasuryBalance) })} />
            </div>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-soft">
              <span>
                 {t("Charity:")} {s.project.charityName ?? "—"} (<AddressLink address={s.project.charity} />)
              </span>
              <span>
                 {t("Treasury:")} <AddressLink address={s.project.treasury} />
              </span>
              <span>{t("Snapshot taken")} {formatDate(s.generatedAt)}</span>
            </div>
          </Card>

          <SectionTitle>{t("Evidence at the time of publication")}</SectionTitle>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-ink-soft">
                <tr>
                  <th className="px-4 py-3">{t("Type")}</th>
                  <th className="px-4 py-3">{t("Fingerprint")}</th>
                  <th className="px-4 py-3">{t("Status")}</th>
                  <th className="px-4 py-3">{t("Verified by")}</th>
                  <th className="px-4 py-3">{t("Tx")}</th>
                </tr>
              </thead>
              <tbody>
                {s.evidence.map((e) => (
                  <tr key={e.evidenceId} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">{t(e.kind)}</td>
                    <td className="px-4 py-3">
                      <HashText value={e.contentHash} />
                    </td>
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

          <SectionTitle>{t("Disbursements from the treasury")}</SectionTitle>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-ink-soft">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">{t("To")}</th>
                  <th className="px-4 py-3">{t("Amount")}</th>
                  <th className="px-4 py-3">{t("Status")}</th>
                </tr>
              </thead>
              <tbody>
                {s.disbursements.length === 0 && (
                  <tr>
                    <td className="px-4 py-3 text-ink-soft" colSpan={4}>
                       {t("No disbursements yet.")} </td>
                  </tr>
                )}
                {s.disbursements.map((d) => (
                  <tr key={d.proposalId} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">{d.proposalId}</td>
                    <td className="px-4 py-3">
                      <AddressLink address={d.to} />
                    </td>
                    <td className="px-4 py-3">{formatUsdc(d.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={d.executed ? "good" : "warn"}>{d.executed ? t("Executed") : t("Pending approvals")}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <SectionTitle hint={t("{value0} purchases", { value0: s.orders.length })}>{t("Purchases behind the donations")}</SectionTitle>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b border-line text-left text-xs uppercase text-ink-soft">
                <tr>
                  <th className="px-4 py-3">{t("Product")}</th>
                  <th className="px-4 py-3">{t("Donation")}</th>
                  <th className="px-4 py-3">{t("Status")}</th>
                  <th className="px-4 py-3">{t("Date")}</th>
                  <th className="px-4 py-3">{t("Tx")}</th>
                </tr>
              </thead>
              <tbody>
                {s.orders.map((o) => (
                  <tr key={o.paymentId} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">
                      {o.productName ?? `#${o.campaignId}`} × {o.quantity}
                    </td>
                    <td className="px-4 py-3">{formatUsdc(o.donation)}</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(o.status)}>{t(o.status)}</Badge>
                    </td>
                    <td className="px-4 py-3">{formatDate(o.timestamp)}</td>
                    <td className="px-4 py-3">
                      <TxLink hash={o.txHash} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
      {!s && <Alert tone="warn">{t("The report snapshot is not available on this server, so its contents cannot be shown.")}</Alert>}
    </>
  );
}
