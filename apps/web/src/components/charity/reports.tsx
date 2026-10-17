"use client";

import { useI18n } from "@/lib/i18n/context";

import Link from "next/link";
import { useMemo, useState } from "react";
import { apiPost, useApi } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { useAction, useTx, useWalletAuth } from "@/lib/client/hooks";
import { formatUsdc } from "@/lib/shared/format";
import type { Hex, ProjectDetail, ProjectView, ReportSnapshot } from "@/lib/shared/types";
import { Alert, Button, Card, EmptyState, Field, HashText, Loading, SectionTitle, Select, Stat, TxStatus } from "@/components/ui";

type Prepared = { reportHash: Hex; uri: string; snapshot: ReportSnapshot };

export function ReportsTab({ address }: { address: Hex }) {
  const { t, formatDate } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const auth = useWalletAuth();
  const projects = useApi<ProjectView[]>(`/api/data/projects?charity=${address}`);
  const [selected, setSelected] = useState("");
  const [prepared, setPrepared] = useState<Prepared | null>(null);

  const projectId = selected || projects.data?.[0]?.projectId || "";
  const detail = useApi<ProjectDetail>(projectId ? `/api/data/projects/${projectId}` : null, 6_000);

  const prepare = () =>
    action.run(async () => {
      const headers = await auth("report:prepare");
      setPrepared(await apiPost<Prepared>("/api/reports/prepare", { projectId }, headers));
    });

  const publish = async () => {
    if (!prepared) return;
    await tx.send({ ...k.reports, functionName: "publishReport", args: [BigInt(projectId), prepared.reportHash, prepared.uri] }).catch(() => undefined);
  };

  if (projects.isLoading) return <Loading />;
  if (!projects.data?.length) return <EmptyState title={t("Create a project first")} />;

  const s = prepared?.snapshot;
  return (
    <>
      <Card className="max-w-2xl space-y-4">
        <div className="font-semibold">{t("Publish an impact report")}</div>
        <p className="text-sm text-ink-soft">
           {t("A report freezes the project's purchases, donations, evidence statuses and disbursements. Its fingerprint is written on-chain so anyone can check the published page has not been altered. At least one evidence item must be verified.")} </p>
        <Field label={t("Project")}>
          <Select
            value={projectId}
            onChange={(e) => {
              setSelected(e.target.value);
              setPrepared(null);
            }}
          >
            {projects.data.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                #{p.projectId} {p.meta?.title}
              </option>
            ))}
          </Select>
        </Field>
        {detail.data && (
          <div className="text-sm text-ink-soft">
            {detail.data.evidence.verified}  {t("verified evidence ·")} {detail.data.reports.length}  {t("report version(s) published")} </div>
        )}
        {action.error && <Alert tone="bad">{action.error}</Alert>}
        <Button variant="secondary" disabled={action.pending} onClick={() => void prepare()}>
           {t("1. Generate snapshot")} </Button>

        {s && prepared && (
          <div className="space-y-3 rounded-xl bg-mint-soft p-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label={t("Orders")} value={s.totals.orders} />
              <Stat label={t("Settled")} value={formatUsdc(s.totals.donationsSettled)} />
              <Stat label={t("Disbursed")} value={formatUsdc(s.totals.disbursed)} />
              <Stat label={t("Evidence")} value={s.evidence.length} />
            </div>
            <div className="text-xs text-ink-soft">
               {t("Taken")} {formatDate(s.generatedAt)}  {t("· fingerprint")} <HashText value={prepared.reportHash} />
            </div>
            <Button disabled={tx.busy} onClick={() => void publish()}>
               {t("2. Publish on-chain")} </Button>
            <TxStatus tx={tx} />
          </div>
        )}
      </Card>

      {detail.data && detail.data.reports.length > 0 && (
        <>
          <SectionTitle>{t("Published versions")}</SectionTitle>
          <div className="space-y-2">
            {detail.data.reports.map((r) => (
              <Card key={r.version} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="text-sm">
                  v{r.version} · {formatDate(r.publishedAt)} · <HashText value={r.reportHash} />
                </div>
                <Link href={`/reports/${projectId}`} className="underline text-sm">
                   {t("Open report")} </Link>
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
