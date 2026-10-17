"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { isAddress, keccak256, stringToHex, toBytes } from "viem";
import { useApi } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { useAction, useTx } from "@/lib/client/hooks";
import { bpsToPercent } from "@/lib/shared/format";
import type { AdminOverview, Hex, PartyView } from "@/lib/shared/types";
import { RequireWallet } from "@/components/wallet";
import {
  Alert,
  AddressText,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Loading,
  PageHeader,
  SectionTitle,
  statusTone,
  TxStatus,
} from "@/components/ui";

export default function AdminPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("Admin")} subtitle={t("Admit participants, appoint verifiers, and use emergency controls. Admins cannot move treasury funds.")} />
      <RequireWallet>{(address) => <Panel address={address} />}</RequireWallet>
    </>
  );
}

function Panel({ address }: { address: Hex }) {
  const { t } = useI18n();
  const overview = useApi<AdminOverview>("/api/data/admin", 5_000);
  if (overview.isLoading) return <Loading />;
  if (overview.error || !overview.data) return <ErrorNote error={overview.error ?? new Error("No data")} />;
  if (overview.data.admin.toLowerCase() !== address.toLowerCase()) {
    return <Alert tone="warn">{t("Only the platform admin wallet (")}{overview.data.admin.slice(0, 8)}{t("...) can use this page.")}</Alert>;
  }
  return (
    <div className="space-y-2">
      <Parties kind="merchant" />
      <Parties kind="charity" />
      <Verifiers overview={overview.data} />
      <Controls overview={overview.data} />
      <Settings overview={overview.data} />
    </div>
  );
}

function Parties({ kind }: { kind: "merchant" | "charity" }) {
  const { t, formatDate } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const list = useApi<PartyView[]>(`/api/data/parties?kind=${kind}`, 5_000);
  const registry = kind === "merchant" ? k.merchants : k.charities;
  const call = (functionName: "approve" | "reject" | "suspend", wallet: Hex) =>
    void tx.send({ ...registry, functionName, args: [wallet] } as never).catch(() => undefined);

  return (
    <>
      <SectionTitle hint={t("{value0} total", { value0: list.data?.length ?? 0 })}>{kind === "merchant" ? t("Merchants") : t("Charities")}</SectionTitle>
      {list.data?.length === 0 && <EmptyState title={t("No applications yet")} />}
      <div className="space-y-2">
        {list.data?.map((p) => (
          <Card key={p.wallet} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="text-sm">
              <div className="flex items-center gap-2">
                <b>{p.meta?.name ?? t("Unnamed")}</b>
                <Badge tone={statusTone(p.status)}>{t(p.status)}</Badge>
              </div>
              <div className="text-ink-soft">
                <AddressText value={p.wallet} />  {t("- applied")} {formatDate(p.appliedAt)}
              </div>
              {p.meta?.description && <div className="mt-1 max-w-xl text-ink-soft">{p.meta.description}</div>}
            </div>
            <div className="flex gap-2">
              {(p.status === "Pending" || p.status === "Suspended") && (
                <Button disabled={tx.busy} onClick={() => call("approve", p.wallet)}>
                  {p.status === "Pending" ? t("Approve") : t("Reinstate")}
                </Button>
              )}
              {p.status === "Pending" && (
                <Button variant="danger" disabled={tx.busy} onClick={() => call("reject", p.wallet)}>
                   {t("Reject")} </Button>
              )}
              {p.status === "Approved" && (
                <Button variant="secondary" disabled={tx.busy} onClick={() => call("suspend", p.wallet)}>
                   {t("Suspend")} </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
      <TxStatus tx={tx} />
    </>
  );
}

const VERIFIER_ROLE = keccak256(toBytes("VERIFIER_ROLE"));

function Verifiers({ overview }: { overview: AdminOverview }) {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const [wallet, setWallet] = useState("");

  const grant = () =>
    action.run(async () => {
      if (!isAddress(wallet)) throw new Error("Enter a valid address");
      await tx.send({ ...k.evidence, functionName: "grantRole", args: [VERIFIER_ROLE, wallet as Hex] });
      setWallet("");
    });

  return (
    <>
      <SectionTitle>{t("Verifiers")}</SectionTitle>
      <Card className="space-y-4">
        <div className="space-y-2">
          {overview.verifiers.length === 0 && <div className="text-sm text-ink-soft">{t("No verifiers appointed.")}</div>}
          {overview.verifiers.map((v) => (
            <div key={v} className="flex items-center justify-between text-sm">
              <AddressText value={v} />
              <Button
                variant="ghost"
                disabled={tx.busy}
                onClick={() => void tx.send({ ...k.evidence, functionName: "revokeRole", args: [VERIFIER_ROLE, v] }).catch(() => undefined)}
              >
                 {t("Revoke")} </Button>
            </div>
          ))}
        </div>
        <div className="flex max-w-xl items-end gap-3">
          <div className="flex-1">
            <Field label={t("Appoint a verifier")}>
              <Input value={wallet} onChange={(e) => setWallet(e.target.value)} className="font-mono" placeholder="0x..." />
            </Field>
          </div>
          <Button disabled={tx.busy || action.pending} onClick={() => void grant()}>
             {t("Grant role")} </Button>
        </div>
        {action.error && <Alert tone="bad">{action.error}</Alert>}
        <TxStatus tx={tx} />
      </Card>
    </>
  );
}

function Controls({ overview }: { overview: AdminOverview }) {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const [target, setTarget] = useState<"campaign" | "project">("campaign");
  const [id, setId] = useState("");
  const [reason, setReason] = useState("");

  const toggle = (paused: boolean) =>
    action.run(async () => {
      if (!/^\d+$/.test(id)) throw new Error("Enter a numeric id");
      const r = stringToHex(reason.slice(0, 31) || "admin", { size: 32 });
      await tx.send(
        target === "campaign"
          ? { ...k.pause, functionName: "setCampaignPaused", args: [BigInt(id), paused, r] }
          : { ...k.pause, functionName: "setProjectPaused", args: [BigInt(id), paused, r] },
      );
    });

  return (
    <>
      <SectionTitle>{t("Emergency controls")}</SectionTitle>
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">{t("All sales")} {overview.globalPaused ? t("are paused") : t("are open")}</div>
            <div className="text-sm text-ink-soft">{t("Pausing blocks new purchases only. Refunds, settlement and treasury funds are unaffected.")}</div>
          </div>
          <Button
            variant={overview.globalPaused ? "primary" : "danger"}
            disabled={tx.busy}
            onClick={() => void tx.send({ ...k.pause, functionName: "setGlobalPaused", args: [!overview.globalPaused] }).catch(() => undefined)}
          >
            {overview.globalPaused ? t("Resume sales") : t("Pause all sales")}
          </Button>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-[auto_1fr_2fr_auto_auto]">
          <Field label={t("Scope")}>
            <select
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm"
              value={target}
              onChange={(e) => setTarget(e.target.value as "campaign" | "project")}
            >
              <option value="campaign">{t("Campaign")}</option>
              <option value="project">{t("Project")}</option>
            </select>
          </Field>
          <Field label={t("Id")}>
            <Input value={id} onChange={(e) => setId(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label={t("Reason (short)")}>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Button variant="danger" disabled={tx.busy || action.pending} onClick={() => void toggle(true)}>
             {t("Pause")} </Button>
          <Button variant="secondary" disabled={tx.busy || action.pending} onClick={() => void toggle(false)}>
             {t("Unpause")} </Button>
        </div>
        {action.error && <Alert tone="bad">{action.error}</Alert>}
        <div className="text-sm text-ink-soft">
           {t("Paused campaigns:")} {overview.pausedCampaigns.length ? overview.pausedCampaigns.map((c) => `#${c}`).join(", " ) : t("none")}  {t("- paused projects:")}{" "}
          {overview.pausedProjects.length ? overview.pausedProjects.map((c) => `#${c}`).join(", ") : t("none")}
        </div>
        <TxStatus tx={tx} />
      </Card>
    </>
  );
}

function Settings({ overview }: { overview: AdminOverview }) {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const [fee, setFee] = useState(String(overview.serviceFeeBps));
  const [receiver, setReceiver] = useState<string>(overview.platformReceiver);

  return (
    <>
      <SectionTitle>{t("Platform settings")}</SectionTitle>
      <Card className="space-y-4">
        <div className="text-sm text-ink-soft">
           {t("Fee changes apply only to campaigns published afterwards; existing campaigns keep their own fee. Current default:")} {bpsToPercent(overview.serviceFeeBps)}{t(". Payment token allowed:")} {overview.tokenAllowed ? t("yes") : t("no")}.
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <Field label={t("Default platform fee (basis points, max 1000)")}>
            <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" />
          </Field>
          <Button
            disabled={tx.busy || action.pending}
            onClick={() =>
              void action.run(async () => {
                const bps = Number(fee);
                if (!Number.isInteger(bps) || bps < 0 || bps > 1000) throw new Error("Fee must be 0 to 1000 basis points");
                await tx.send({ ...k.campaigns, functionName: "setDefaultServiceFeeBps", args: [bps] });
              })
            }
          >
             {t("Update fee")} </Button>
        </div>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
          <Field label={t("Platform fee receiver")}>
            <Input value={receiver} onChange={(e) => setReceiver(e.target.value)} className="font-mono" />
          </Field>
          <Button
            disabled={tx.busy || action.pending}
            onClick={() =>
              void action.run(async () => {
                if (!isAddress(receiver)) throw new Error("Enter a valid address");
                await tx.send({ ...k.router, functionName: "setPlatformReceiver", args: [receiver as Hex] });
              })
            }
          >
             {t("Update receiver")} </Button>
        </div>
        {action.error && <Alert tone="bad">{action.error}</Alert>}
        <TxStatus tx={tx} />
      </Card>
    </>
  );
}



