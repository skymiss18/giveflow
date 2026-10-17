"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { zeroHash } from "viem";
import { apiPost, useApi } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { useAction, useEvidenceViewer, useNote, useTx } from "@/lib/client/hooks";
import type { AdminOverview, EvidenceView, Hex } from "@/lib/shared/types";
import { EvidenceTable } from "@/components/evidence-table";
import { RequireWallet } from "@/components/wallet";
import { Alert, Button, Card, EmptyState, ErrorNote, Loading, PageHeader, SectionTitle, Textarea, TxStatus } from "@/components/ui";

export default function VerifierPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        title={t("Verifier workspace")}
        subtitle={t("Open the private files, check them against the claim, and record an independent decision on-chain.")}
      />
      <RequireWallet>{(address) => <Workspace address={address} />}</RequireWallet>
    </>
  );
}

function Workspace({ address }: { address: Hex }) {
  const { t } = useI18n();
  const admin = useApi<AdminOverview>("/api/data/admin", 6_000);
  const all = useApi<EvidenceView[]>("/api/data/evidence", 5_000);
  if (admin.isLoading || all.isLoading) return <Loading />;
  if (admin.error || all.error) return <ErrorNote error={admin.error ?? all.error} />;

  const isVerifier = admin.data?.verifiers.some((v) => v.toLowerCase() === address.toLowerCase());
  if (!isVerifier) return <Alert tone="warn">{t("This wallet is not a verifier. Ask the platform admin to grant the verifier role.")}</Alert>;

  const queue = (all.data ?? []).filter((e) => e.status === "Submitted" && e.submitter.toLowerCase() !== address.toLowerCase());
  const done = (all.data ?? []).filter((e) => e.status !== "Submitted");

  return (
    <>
      <SectionTitle hint={t("{value0} waiting", { value0: queue.length })}>{t("Review queue")}</SectionTitle>
      {queue.length === 0 ? <EmptyState title={t("Nothing to review")} /> : <div className="space-y-4">{queue.map((e) => <ReviewCard key={e.evidenceId} e={e} />)}</div>}
      <SectionTitle>{t("Decided")}</SectionTitle>
      <EvidenceTable items={done} empty={t("No decisions yet.")} showProject />
    </>
  );
}

function ReviewCard({ e }: { e: EvidenceView }) {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const view = useEvidenceViewer();
  const [note, setNote] = useState("");
  const [opened, setOpened] = useState(false);
  const existing = useNote(e.noteHash);

  const decide = (approved: boolean) =>
    action.run(async () => {
      let noteHash: Hex = zeroHash;
      if (note.trim()) {
        noteHash = (await apiPost<{ hash: Hex }>("/api/metadata", { kind: "note", data: { text: note } })).hash;
      }
      await tx.send({ ...k.evidence, functionName: "verifyEvidence", args: [BigInt(e.evidenceId), approved, noteHash] });
    });

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-medium">
            {t(e.kind)}  {t("- project #")}{e.projectId}
          </div>
          <div className="text-sm text-ink-soft">{e.file ? `${e.file.name} · ${e.file.mime}` : t("File not stored on this server")}</div>
        </div>
        <Button
          variant="secondary"
          disabled={!e.file}
          onClick={() => void action.run(async () => { await view(e.contentHash); setOpened(true); })}
        >
           {t("Open file")} </Button>
      </div>
      <div className="break-all font-mono text-xs text-ink-soft">{t("Fingerprint")} {e.contentHash}</div>
      <Textarea placeholder={t("Optional note for the record (no personal data)")} value={note} onChange={(ev) => setNote(ev.target.value)} rows={2} />
      {existing && <div className="text-sm text-ink-soft">{existing}</div>}
      {action.error && <Alert tone="bad">{action.error}</Alert>}
      <div className="flex gap-3">
        <Button disabled={!opened || tx.busy || action.pending} onClick={() => void decide(true)}>
           {t("Verify")} </Button>
        <Button variant="danger" disabled={!opened || tx.busy || action.pending} onClick={() => void decide(false)}>
           {t("Reject")} </Button>
        {!opened && <span className="self-center text-xs text-ink-soft">{t("Open the file before deciding.")}</span>}
      </div>
      <TxStatus tx={tx} />
    </Card>
  );
}



