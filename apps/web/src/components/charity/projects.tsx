"use client";

import { useI18n } from "@/lib/i18n/context";

import Link from "next/link";
import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { apiPost, useApi } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { useAction, useTx } from "@/lib/client/hooks";
import { PROJECT_CATEGORIES } from "@/lib/shared/constants";
import { formatUsdc, parseUsdc } from "@/lib/shared/format";
import type { Hex, ProjectView, TreasuryView } from "@/lib/shared/types";
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Loading, SectionTitle, Select, statusTone, Textarea, TxStatus } from "@/components/ui";

export function ProjectsTab({ address }: { address: Hex }) {
  const { t: translate } = useI18n();
  const projects = useApi<ProjectView[]>(`/api/data/projects?charity=${address}`, 6_000);
  return (
    <>
      <CreateProject address={address} />
      <SectionTitle>{translate("Your projects")}</SectionTitle>
      {projects.isLoading && <Loading />}
      {projects.data?.length === 0 && <EmptyState title={translate("No projects yet")} />}
      <div className="space-y-3">
        {projects.data?.map((p) => <ProjectRow key={p.projectId} p={p} />)}
      </div>
    </>
  );
}

function CreateProject({ address }: { address: Hex }) {
  const { t: translate } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const treasuries = useApi<TreasuryView[]>(`/api/data/treasuries?wallet=${address}`);
  const [treasury, setTreasury] = useState("");
  const [custom, setCustom] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [usage, setUsage] = useState("");
  const [category, setCategory] = useState<(typeof PROJECT_CATEGORIES)[number]>(PROJECT_CATEGORIES[0]);
  const [location, setLocation] = useState("");
  const [target, setTarget] = useState("5000");

  const chosen = treasury || treasuries.data?.[0]?.address || "custom";

  const submit = () =>
    action.run(async () => {
      const dest = chosen === "custom" ? custom : chosen;
      if (!isAddress(dest)) throw new Error("Choose or enter a valid treasury address");
      const goal = parseUsdc(target);
      const { hash } = await apiPost<{ hash: Hex }>("/api/metadata", {
        kind: "project",
        data: { title, summary, category, ...(location ? { location } : {}), ...(usage.trim() ? { usage } : {}) },
      });
      await tx.send({ ...k.charities, functionName: "createProject", args: [dest as Hex, hash, goal] });
    });

  return (
    <Card className="max-w-2xl space-y-4">
      <div className="font-semibold">{translate("Create a project")}</div>
      <Field label={translate("Donation treasury")} hint={translate("Donations from sales are paid here. It cannot be changed later.")}>
        <Select value={chosen} onChange={(e) => setTreasury(e.target.value)}>
          {treasuries.data?.map((t) => (
            <option key={t.address} value={t.address}>
              {t.address} ({t.threshold}{translate("-of-")}{t.owners.length})
            </option>
          ))}
          <option value="custom">{translate("Another address…")}</option>
        </Select>
      </Field>
      {chosen === "custom" && (
        <Field label={translate("Treasury address")} hint={translate("A multi-signature wallet is strongly recommended.")}>
          <Input value={custom} onChange={(e) => setCustom(e.target.value)} className="font-mono" placeholder="0x…" />
        </Field>
      )}
      <Field label={translate("Title")}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={translate("What this fund supports, in a few words")} />
      </Field>
      <Field label={translate("Summary")} hint={translate("Describe the cause and who benefits in general terms. Never include names or personal details of beneficiaries.")}>
        <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={4} />
      </Field>
      <Field label={translate("How donations will be used (optional)")} hint={translate("For example: supplies, meals, equipment, services or emergency aid. Donors see this next to the evidence you publish.")}>
        <Textarea value={usage} onChange={(e) => setUsage(e.target.value)} rows={3} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={translate("Category")}>
          <Select value={category} onChange={(e) => setCategory(e.target.value as (typeof PROJECT_CATEGORIES)[number])}>
            {PROJECT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{translate(c)}</option>
            ))}
          </Select>
        </Field>
        <Field label={translate("Location (optional)")}>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </Field>
        <Field label={translate("Funding goal (mUSDC)")}>
          <Input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      {action.error && <Alert tone="bad">{action.error}</Alert>}
      <Button disabled={!title.trim() || !summary.trim() || tx.busy || action.pending} onClick={() => void submit()}>
         {translate("Create project")} </Button>
      <TxStatus tx={tx} />
    </Card>
  );
}

function ProjectRow({ p }: { p: ProjectView }) {
  const { t: translate } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const setStatus = (status: 2 | 3) =>
    void tx.send({ ...k.charities, functionName: "setProjectStatus", args: [BigInt(p.projectId), status] }).catch(() => undefined);
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link href={`/projects/${p.projectId}`} className="font-medium underline">
              #{p.projectId} {p.meta?.title}
            </Link>
            <Badge tone={statusTone(p.status)}>{translate(p.status)}</Badge>
          </div>
          <div className="mt-1 text-sm text-ink-soft">
            {formatUsdc(p.received)}  {translate("received ·")} {formatUsdc(p.pending)}  {translate("in escrow · treasury balance")} {formatUsdc(p.treasuryBalance)} · {p.evidence.verified}/
            {p.evidence.submitted}  {translate("evidence verified")} </div>
        </div>
        {p.status === "Active" && (
          <div className="flex gap-2">
            <Button variant="secondary" disabled={tx.busy} onClick={() => setStatus(2)}>
               {translate("Mark completed")} </Button>
            <Button variant="ghost" disabled={tx.busy} onClick={() => setStatus(3)}>
               {translate("Close")} </Button>
          </div>
        )}
      </div>
      <TxStatus tx={tx} />
    </Card>
  );
}
