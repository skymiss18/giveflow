"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { keccak256, stringToHex, toBytes } from "viem";
import { useApi, apiPost } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { useAction, useTx } from "@/lib/client/hooks";
import { PROJECT_STATUS } from "@/lib/shared/constants";
import { bpsToPercent, formatUsdc, parseUsdc } from "@/lib/shared/format";
import type { CampaignView, OrderView, PartyView, ProjectView } from "@/lib/shared/types";
import { OrderTable } from "@/components/order-table";
import { RequireWallet } from "@/components/wallet";
import { StoreTerminal } from "@/components/store-terminal";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Loading,
  PageHeader,
  SectionTitle,
  Select,
  statusTone,
  Tabs,
  Textarea,
  TxStatus,
} from "@/components/ui";

function randomProductNonce(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function MerchantPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        title={t("Merchant console")}
        subtitle={t("Publish products with a donation rule that the contract enforces on every sale.")}
      />
      <RequireWallet>{(address) => <Console address={address} />}</RequireWallet>
    </>
  );
}

function Console({ address }: { address: `0x${string}` }) {
  const { t } = useI18n();
  const party = useApi<PartyView[]>(`/api/data/parties?kind=merchant&wallet=${address}`, 5_000);
  if (party.isLoading) return <Loading />;
  const me = party.data?.[0];

  if (!me || me.status === "Rejected") {
    return (
      <>
        {me?.status === "Rejected" && <Alert tone="bad">{t("Your previous application was rejected. You can apply again.")}</Alert>}
        <ApplyForm address={address} />
      </>
    );
  }
  if (me.status === "Pending") return <Alert tone="warn">{t("Your application is waiting for admin approval.")}</Alert>;
  if (me.status === "Suspended") return <Alert tone="bad">{t("Your merchant account is suspended. Contact the platform admin.")}</Alert>;
  return <Workspace address={address} merchant={me} />;
}

function ApplyForm({ address }: { address: `0x${string}` }) {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [payout, setPayout] = useState<string>(address);

  const submit = () =>
    action.run(async () => {
      if (!/^0x[0-9a-fA-F]{40}$/.test(payout)) throw new Error("Enter a valid payout address");
      const { hash } = await apiPost<{ hash: `0x${string}` }>("/api/metadata", {
        kind: "merchant-profile",
        data: { name, description, ...(website ? { website } : {}) },
      });
      await tx.send({ ...k.merchants, functionName: "applyAsMerchant", args: [payout as `0x${string}`, hash] });
    });

  return (
    <Card className="max-w-xl space-y-4">
      <div className="font-semibold">{t("Apply as a merchant")}</div>
      <Field label={t("Business name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("Description")}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label={t("Website (optional)")}>
        <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
      </Field>
      <Field label={t("Payout address")} hint={t("Where your share of each sale is sent. Keep it separate from the charity treasury.")}>
        <Input value={payout} onChange={(e) => setPayout(e.target.value)} className="font-mono" />
      </Field>
      {action.error && <Alert tone="bad">{action.error}</Alert>}
      <Button disabled={!name.trim() || tx.busy || action.pending} onClick={() => void submit()}>
         {t("Submit application")} </Button>
      <TxStatus tx={tx} />
    </Card>
  );
}

function Workspace({ address, merchant }: { address: `0x${string}`; merchant: PartyView }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"Products" | "Sales" | "In-store">("Products");
  const [editing, setEditing] = useState<CampaignView | "new" | null>(null);
  const campaigns = useApi<CampaignView[]>(`/api/data/campaigns?merchant=${address}`, 6_000);

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-ink-soft">
        <Badge tone="good">{t("Approved")}</Badge>
        {merchant.meta?.name}
        <span className="min-w-0 break-all">{t("- payout")} {merchant.receiver}</span>
      </div>
      <Tabs tabs={["Products", "Sales", "In-store"] as const} value={tab} onChange={setTab} />
      {tab === "Products" && (
        <>
          {editing ? (
            <ProductForm
              key={editing === "new" ? "new" : editing.campaignId}
              address={address}
              base={editing === "new" ? null : editing}
              onDone={() => setEditing(null)}
            />
          ) : (
            <Button onClick={() => setEditing("new")}>{t("Publish a new product")}</Button>
          )}
          <SectionTitle>{t("Your campaigns")}</SectionTitle>
          {campaigns.isLoading && <Loading />}
          {campaigns.data?.length === 0 && <EmptyState title={t("Nothing published yet")} />}
          <div className="space-y-3">
            {campaigns.data?.map((c) => <CampaignRow key={c.campaignId} c={c} onNewVersion={() => setEditing(c)} />)}
          </div>
        </>
      )}
      {tab === "Sales" && <Sales address={address} />}
      {tab === "In-store" && <StoreTerminal campaigns={campaigns.data ?? []} />}
    </>
  );
}

function CampaignRow({ c, onNewVersion }: { c: CampaignView; onNewVersion: () => void }) {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const rule = BigInt(c.fixedDonationAmount) > 0n ? t("{amount} per item", { amount: formatUsdc(c.fixedDonationAmount) }) : bpsToPercent(c.percentageDonationBps);
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <Link href={`/shop/${c.campaignId}`} className="font-medium underline">
            {c.meta?.name ?? t("Campaign #{value0}", { value0: c.campaignId })}
          </Link>
          <Badge tone={statusTone(c.status)}>{t(c.status)}</Badge>
          <Badge>v{c.ruleVersion}</Badge>
        </div>
        <div className="mt-1 text-sm text-ink-soft">
          {formatUsdc(c.unitPrice)}  {t("mUSDC - donates")} {rule} - {c.stats.units}  {t("sold -")} {formatUsdc(c.stats.donated)}  {t("donated")} </div>
        <TxStatus tx={tx} />
      </div>
      <div className="flex gap-2">
        {c.status !== "Superseded" && (
          <Button
            variant="secondary"
            disabled={tx.busy}
            onClick={() => void tx.send({ ...k.campaigns, functionName: "setPaused", args: [BigInt(c.campaignId), c.status === "Active"] }).catch(() => undefined)}
          >
            {c.status === "Active" ? t("Pause") : t("Resume")}
          </Button>
        )}
        {c.isLatest && (
          <Button variant="ghost" onClick={onNewVersion}>
             {t("New rule version")} </Button>
        )}
      </div>
    </Card>
  );
}

function ProductForm({ address, base, onDone }: { address: `0x${string}`; base: CampaignView | null; onDone: () => void }) {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const projects = useApi<ProjectView[]>("/api/data/projects");
  const active = (projects.data ?? []).filter((p) => p.status === PROJECT_STATUS[1]);

  const [name, setName] = useState(base?.meta?.name ?? "");
  const [description, setDescription] = useState(base?.meta?.description ?? "");
  const [imageUrl, setImageUrl] = useState(base?.meta?.imageUrl ?? "");
  const [price, setPrice] = useState(base ? formatUsdc(base.unitPrice).replace(/,/g, "") : "25");
  const [mode, setMode] = useState<"fixed" | "percent">(base && BigInt(base.fixedDonationAmount) === 0n ? "percent" : "fixed");
  const [amount, setAmount] = useState(
    base ? (BigInt(base.fixedDonationAmount) > 0n ? formatUsdc(base.fixedDonationAmount).replace(/,/g, "") : String(base.percentageDonationBps / 100)) : "1",
  );
  const [projectId, setProjectId] = useState(base?.projectId ?? "");
  const [days, setDays] = useState("30");
  const [refundDays, setRefundDays] = useState("0");
  const [cap, setCap] = useState("");

  const submit = () =>
    action.run(async () => {
      const unitPrice = parseUsdc(price);
      const pid = projectId || active[0]?.projectId;
      if (!pid) throw new Error("Choose a charity project");
      let fixed = 0n;
      let bps = 0;
      if (mode === "fixed") fixed = parseUsdc(amount);
      else {
        bps = Math.round(Number(amount) * 100);
        if (!Number.isFinite(bps) || bps <= 0 || bps > 10_000) throw new Error("Enter a percentage between 0 and 100");
      }
      const { hash } = await apiPost<{ hash: `0x${string}` }>("/api/metadata", {
        kind: "product",
        data: { name, description, ...(imageUrl ? { imageUrl } : {}) },
      });
      const now = Math.floor(Date.now() / 1000);
      const productId = base?.productId ?? keccak256(toBytes(`${address.toLowerCase()}:${name}:${randomProductNonce()}`));
      await tx.send({
        ...k.campaigns,
        functionName: "createCampaign",
        args: [
          {
            productId,
            projectId: BigInt(pid),
            paymentToken: k.deployment.MockUSDC,
            unitPrice,
            fixedDonationAmount: fixed,
            percentageDonationBps: bps,
            saleStart: BigInt(now - 60),
            saleEnd: BigInt(now + Number(days) * 86_400),
            refundWindow: BigInt(Number(refundDays) * 86_400),
            maxDonation: cap ? parseUsdc(cap) : 0n,
            metadataHash: hash,
          },
        ],
      });
      onDone();
    });

  return (
    <Card className="max-w-2xl space-y-4">
      <div className="font-semibold">{base ? t("New rule version for \"{value0}\"", { value0: base.meta?.name ?? t("Product") }) : t("Publish a product")}</div>
      {base && <Alert>{t("Publishing replaces the current version for new purchases. Existing orders keep the rules they were bought under.")}</Alert>}
      <Field label={t("Product name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("Description")}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label={t("Image URL (optional)")}>
        <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("Price (mUSDC)")}>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={t("Charity project")}>
          <Select value={projectId || active[0]?.projectId || ""} onChange={(e) => setProjectId(e.target.value)}>
            {active.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                #{p.projectId} {p.meta?.title}
                {p.meta?.category ? ` - ${t(p.meta.category)}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("Donation rule")}>
          <Select value={mode} onChange={(e) => setMode(e.target.value as "fixed" | "percent")}>
            <option value="fixed">{t("Fixed amount per item")}</option>
            <option value="percent">{t("Percentage of sales")}</option>
          </Select>
        </Field>
        <Field label={mode === "fixed" ? t("Donation per item (mUSDC)") : t("Donation (% of sales)")}>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={t("Sale length (days)")}>
          <Input value={days} onChange={(e) => setDays(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label={t("Refund window")} hint={t("While open, funds stay in escrow and the buyer can refund. 0 splits instantly.")}>
          <Select value={refundDays} onChange={(e) => setRefundDays(e.target.value)}>
            {[0, 1, 3, 7].map((d) => (
              <option key={d} value={d}>
                {d === 0 ? t("None (instant split)") : t(d === 1 ? "{count} day" : "{count} days", { count: d })}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("Total donation cap (optional, mUSDC)")}>
          <Input value={cap} onChange={(e) => setCap(e.target.value)} inputMode="decimal" />
        </Field>
      </div>
      {action.error && <Alert tone="bad">{action.error}</Alert>}
      {projects.data && active.length === 0 && (
        <Alert tone="warn">{t("No charity project is accepting donations yet. A charity must create one first.")}</Alert>
      )}
      <div className="flex gap-3">
        <Button disabled={!name.trim() || !(projectId || active[0]) || tx.busy || action.pending} onClick={() => void submit()}>
           {t("Publish on-chain")} </Button>
        <Button variant="ghost" onClick={onDone}>
           {t("Cancel")} </Button>
      </div>
      <TxStatus tx={tx} />
    </Card>
  );
}

function Sales({ address }: { address: string }) {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const orders = useApi<OrderView[]>(`/api/data/orders?merchant=${address}`, 6_000);
  if (orders.isLoading) return <Loading />;
  return (
    <>
      <OrderTable
        orders={orders.data ?? []}
        empty={t("No sales yet.")}
        action={(o) =>
          o.status === "Escrowed" ? (
            <button
              className="text-coral-dark underline disabled:opacity-50"
              disabled={tx.busy}
              onClick={() =>
                void tx.send({ ...k.router, functionName: "refund", args: [o.paymentId, stringToHex("merchant-refund", { size: 32 })] }).catch(() => undefined)
              }
            >
              {t("Refund")}
            </button>
          ) : null
        }
      />
      <div className="mt-3">
        <TxStatus tx={tx} />
      </div>
    </>
  );
}



