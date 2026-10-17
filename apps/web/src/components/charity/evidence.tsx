"use client";

import { useI18n } from "@/lib/i18n/context";

import { useMemo, useState } from "react";
import { apiPost, useApi } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { useAction, useEvidenceViewer, useTx, useWalletAuth } from "@/lib/client/hooks";
import { EVIDENCE_KIND } from "@/lib/shared/constants";
import type { EvidenceView, Hex, ProjectView } from "@/lib/shared/types";
import { EvidenceTable } from "@/components/evidence-table";
import { Alert, Button, Card, EmptyState, Field, Loading, SectionTitle, Select, TxStatus } from "@/components/ui";

export function EvidenceTab({ address }: { address: Hex }) {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const auth = useWalletAuth();
  const view = useEvidenceViewer();
  const projects = useApi<ProjectView[]>(`/api/data/projects?charity=${address}`);
  const [selected, setSelected] = useState("");
  const [kind, setKind] = useState<(typeof EVIDENCE_KIND)[number]>("DeliveryReceipt");
  const [file, setFile] = useState<File | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  const projectId = selected || projects.data?.[0]?.projectId || "";
  const evidence = useApi<EvidenceView[]>(projectId ? `/api/data/evidence?projectId=${projectId}` : null, 6_000);

  const submit = () =>
    action.run(async () => {
      if (!file || !projectId) throw new Error("Choose a project and a file");
      const headers = await auth("evidence:upload");
      const form = new FormData();
      form.set("projectId", projectId);
      form.set("file", file);
      const up = await apiPost<{ contentHash: Hex; storageRef: string }>("/api/evidence", form, headers);
      await tx.send({
        ...k.evidence,
        functionName: "submitEvidence",
        args: [BigInt(projectId), EVIDENCE_KIND.indexOf(kind), up.contentHash, up.storageRef],
      });
      setFile(null);
    });

  if (projects.isLoading) return <Loading />;
  if (!projects.data?.length) return <EmptyState title={t("Create a project first")}>{t("Evidence is attached to a project.")}</EmptyState>;

  return (
    <>
      <Card className="max-w-2xl space-y-4">
        <div className="font-semibold">{t("Register delivery evidence")}</div>
        <Alert tone="warn">
           {t("Redact personal data first. Files are encrypted on the server and only verifiers and your charity can open them; the public sees just the fingerprint.")} </Alert>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Project")}>
            <Select value={projectId} onChange={(e) => setSelected(e.target.value)}>
              {projects.data.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  #{p.projectId} {p.meta?.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Type")}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as (typeof EVIDENCE_KIND)[number])}>
              {EVIDENCE_KIND.map((e) => (
                <option key={e} value={e}>{t(e)}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={t("File (PDF, PNG, JPEG or text, up to 10 MB)")}>
          <input
            type="file"
            accept="application/pdf,image/png,image/jpeg,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
            data-testid="evidence-file"
          />
        </Field>
        {action.error && <Alert tone="bad">{action.error}</Alert>}
        <Button disabled={!file || tx.busy || action.pending} onClick={() => void submit()}>
           {t("Upload and register on-chain")} </Button>
        <TxStatus tx={tx} />
      </Card>

      <SectionTitle>{t("Evidence for this project")}</SectionTitle>
      {viewError && <Alert tone="bad">{t(viewError)}</Alert>}
      <EvidenceTable
        items={evidence.data ?? []}
        empty={t("No evidence registered yet.")}
        action={(e) => (
          <button
            className="underline"
            onClick={() => {
              setViewError(null);
              view(e.contentHash).catch((err: Error) => setViewError(err.message));
            }}
          >
            {t("Open file")}
          </button>
        )}
      />
    </>
  );
}
