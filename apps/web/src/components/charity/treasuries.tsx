"use client";

import { useI18n } from "@/lib/i18n/context";

import { useMemo, useState } from "react";
import { isAddress } from "viem";
import { apiPost, useApi } from "@/lib/client/api";
import { contracts, donationTreasuryAbi } from "@/lib/client/contracts";
import { useAction, useNote, useTx } from "@/lib/client/hooks";
import { formatUsdc, parseUsdc } from "@/lib/shared/format";
import type { Hex, ProposalView, TreasuryView } from "@/lib/shared/types";
import {
  Alert,
  AddressLink,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  SectionTitle,
  Textarea,
  TxStatus,
} from "@/components/ui";

export function TreasuriesTab({ address }: { address: Hex }) {
  const { t: translate } = useI18n();
  const treasuries = useApi<TreasuryView[]>(`/api/data/treasuries?wallet=${address}`, 6_000);
  return (
    <>
      <CreateTreasury address={address} />
      <SectionTitle hint={translate("Treasuries you created or co-sign")}>{translate("Your treasuries")}</SectionTitle>
      {treasuries.isLoading && <Loading />}
      {treasuries.data?.length === 0 && <EmptyState title={translate("No treasuries yet")}>{translate("Create one above, then use it as a project's donation address.")}</EmptyState>}
      <div className="space-y-4">
        {treasuries.data?.map((t) => <TreasuryCard key={t.address} treasury={t} me={address} />)}
      </div>
    </>
  );
}

function CreateTreasury({ address }: { address: Hex }) {
  const { t: translate } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const [owners, setOwners] = useState<string>(address);
  const [threshold, setThreshold] = useState("1");

  const submit = () =>
    action.run(async () => {
      const list = owners.split(/[\s,]+/).filter(Boolean);
      if (list.some((o) => !isAddress(o))) throw new Error("Every signer must be a valid address");
      if (new Set(list.map((o) => o.toLowerCase())).size !== list.length) throw new Error("Signers must be unique");
      const t = Number(threshold);
      if (!Number.isInteger(t) || t < 1 || t > list.length) throw new Error("Threshold must be between 1 and the number of signers");
      await tx.send({ ...k.factory, functionName: "createTreasury", args: [list as Hex[], BigInt(t)] });
    });

  return (
    <Card className="max-w-2xl space-y-4">
      <div className="font-semibold">{translate("Create a multi-signature treasury")}</div>
      <p className="text-sm text-ink-soft">
         {translate("Donations from sales land here. No single signer can move funds once the threshold is above 1. Use independent signers for real programmes.")} </p>
      <Field label={translate("Signer addresses")} hint={translate("One per line or comma-separated")}>
        <Textarea value={owners} onChange={(e) => setOwners(e.target.value)} className="font-mono text-xs" rows={4} />
      </Field>
      <Field label={translate("Approvals required")}>
        <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="numeric" className="max-w-24" />
      </Field>
      {action.error && <Alert tone="bad">{action.error}</Alert>}
      <Button disabled={tx.busy || action.pending} onClick={() => void submit()}>
         {translate("Create treasury")} </Button>
      <TxStatus tx={tx} />
    </Card>
  );
}

function TreasuryCard({ treasury: t, me }: { treasury: TreasuryView; me: Hex }) {
  const { t: translate } = useI18n();
  const [open, setOpen] = useState(false);
  const isOwner = t.owners.some((o) => o.toLowerCase() === me.toLowerCase());
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm text-ink-soft">{translate("Treasury")}</div>
          <AddressLink address={t.address} />
          <div className="mt-2 text-sm">
            {t.threshold}  {translate("of")} {t.owners.length}  {translate("signers ·")}{" "}
            {t.projectIds.length > 0 ? translate("used by project {value0}", { value0: t.projectIds.map((i) => `#${i}`).join(", ") }) : translate("not linked to a project")}
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm text-ink-soft">{translate("Balance")}</div>
          <div className="text-2xl font-semibold">{formatUsdc(t.balance)} mUSDC</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {t.owners.map((o) => (
          <Badge key={o} tone={o.toLowerCase() === me.toLowerCase() ? "good" : "neutral"}>
            {o.slice(0, 6)}…{o.slice(-4)}
            {o.toLowerCase() === me.toLowerCase() ? translate(" (you)") : ""}
          </Badge>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {t.proposals.length === 0 && <div className="text-sm text-ink-soft">{translate("No disbursement proposals yet.")}</div>}
        {t.proposals.map((p) => <ProposalRow key={p.proposalId} treasury={t} p={p} me={me} isOwner={isOwner} />)}
      </div>

      {isOwner && (
        <div className="mt-4">
          {open ? <NewProposal treasury={t} onDone={() => setOpen(false)} /> : <Button variant="secondary" onClick={() => setOpen(true)}>{translate("Propose a disbursement")}</Button>}
        </div>
      )}
    </Card>
  );
}

function ProposalRow({ treasury: t, p, me, isOwner }: { treasury: TreasuryView; p: ProposalView; me: Hex; isOwner: boolean }) {
  const { t: translate } = useI18n();
  const tx = useTx();
  const purpose = useNote(p.purposeHash);
  const mine = p.approvedBy.some((a) => a.toLowerCase() === me.toLowerCase());
  const call = (functionName: "approve" | "revoke" | "execute") =>
    void tx.send({ address: t.address, abi: donationTreasuryAbi, functionName, args: [BigInt(p.proposalId)] }).catch(() => undefined);

  return (
    <div className="rounded-xl border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <b>#{p.proposalId}</b> · {formatUsdc(p.amount)}  {translate("mUSDC →")} <AddressLink address={p.to} />
        </div>
        <Badge tone={p.executed ? "good" : "warn"}>{p.executed ? translate("Executed") : translate("{value0}/{value1} approvals", { value0: p.approvals, value1: t.threshold })}</Badge>
      </div>
      {purpose && <div className="mt-1 text-ink-soft">{translate("Purpose:")} {purpose}</div>}
      {isOwner && !p.executed && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!mine && <Button disabled={tx.busy} onClick={() => call("approve")}>{translate("Approve")}</Button>}
          {mine && <Button variant="ghost" disabled={tx.busy} onClick={() => call("revoke")}>{translate("Revoke my approval")}</Button>}
          {p.approvals >= t.threshold && <Button variant="secondary" disabled={tx.busy} onClick={() => call("execute")}>{translate("Execute transfer")}</Button>}
        </div>
      )}
      <TxStatus tx={tx} />
    </div>
  );
}

function NewProposal({ treasury: t, onDone }: { treasury: TreasuryView; onDone: () => void }) {
  const { t: translate } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");

  const submit = () =>
    action.run(async () => {
      if (!isAddress(to)) throw new Error("Enter a valid recipient address");
      const value = parseUsdc(amount);
      if (!purpose.trim()) throw new Error("Describe what the money is for");
      const { hash } = await apiPost<{ hash: Hex }>("/api/metadata", { kind: "note", data: { text: purpose } });
      await tx.send({ address: t.address, abi: donationTreasuryAbi, functionName: "submit", args: [k.deployment.MockUSDC, to as Hex, value, hash] });
      onDone();
    });

  return (
    <div className="space-y-3 rounded-xl bg-mint-soft p-4">
      <Field label={translate("Recipient")}>
        <Input value={to} onChange={(e) => setTo(e.target.value)} className="font-mono" placeholder="0x…" />
      </Field>
      <Field label={translate("Amount (mUSDC)")}>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </Field>
      <Field label={translate("Purpose")} hint={translate("Stored off-chain; its hash is recorded with the proposal. Do not include personal data.")}>
        <Textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={2} />
      </Field>
      {action.error && <Alert tone="bad">{action.error}</Alert>}
      <div className="flex gap-3">
        <Button disabled={tx.busy || action.pending} onClick={() => void submit()}>
           {translate("Submit proposal (counts as your approval)")} </Button>
        <Button variant="ghost" onClick={onDone}>
           {translate("Cancel")} </Button>
      </div>
      <TxStatus tx={tx} />
    </div>
  );
}
