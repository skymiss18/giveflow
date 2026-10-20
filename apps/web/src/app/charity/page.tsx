"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { apiPost, useApi } from "@/lib/client/api";
import { contracts } from "@/lib/client/contracts";
import { useAction, useTx } from "@/lib/client/hooks";
import type { Hex, PartyView } from "@/lib/shared/types";
import { EvidenceTab } from "@/components/charity/evidence";
import { ProjectsTab } from "@/components/charity/projects";
import { ReportsTab } from "@/components/charity/reports";
import { TreasuriesTab } from "@/components/charity/treasuries";
import { RequireWallet } from "@/components/wallet";
import { Alert, Badge, Button, Card, Field, Input, Loading, PageHeader, Tabs, Textarea, TxStatus } from "@/components/ui";

export default function CharityPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        title={t("Charity console")}
        subtitle={t("Receive donations in a multi-signature treasury, prove delivery with evidence, and publish verifiable reports.")}
      />
      <RequireWallet>{(address) => <Console address={address} />}</RequireWallet>
    </>
  );
}

function Console({ address }: { address: Hex }) {
  const { t } = useI18n();
  const party = useApi<PartyView[]>(`/api/data/parties?kind=charity&wallet=${address}`, 5_000);
  const [tab, setTab] = useState<"Treasuries" | "Projects" | "Evidence" | "Reports">("Treasuries");
  if (party.isLoading) return <Loading />;
  if (party.error) return <Alert tone="bad">{t("Unable to load your charity status. Please try again.")}</Alert>;
  const me = party.data?.[0];

  if (!me || me.status === "Rejected") {
    return (
      <>
        {me?.status === "Rejected" && <Alert tone="bad">{t("Your previous application was rejected. You can apply again.")}</Alert>}
        <ApplyForm />
      </>
    );
  }
  if (me.status === "Pending") return <Alert tone="warn">{t("Your application is waiting for admin approval.")}</Alert>;
  if (me.status === "Suspended") return <Alert tone="bad">{t("Your charity account is suspended. Contact the platform admin.")}</Alert>;

  return (
    <>
      <div className="mb-6 flex items-center gap-3 text-sm text-ink-soft">
        <Badge tone="good">{t("Approved")}</Badge>
        {me.meta?.name}
      </div>
      <Tabs tabs={["Treasuries", "Projects", "Evidence", "Reports"] as const} value={tab} onChange={setTab} />
      {tab === "Treasuries" && <TreasuriesTab address={address} />}
      {tab === "Projects" && <ProjectsTab address={address} />}
      {tab === "Evidence" && <EvidenceTab address={address} />}
      {tab === "Reports" && <ReportsTab address={address} />}
    </>
  );
}

function ApplyForm() {
  const { t } = useI18n();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const action = useAction();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [website, setWebsite] = useState("");

  const submit = () =>
    action.run(async () => {
      const { hash } = await apiPost<{ hash: Hex }>("/api/metadata", {
        kind: "charity-profile",
        data: {
          name,
          description,
          ...(registrationNo ? { registrationNo } : {}),
          ...(website ? { website } : {}),
        },
      });
      await tx.send({ ...k.charities, functionName: "applyAsCharity", args: [hash] });
    });

  return (
    <Card className="max-w-xl space-y-4">
      <div className="font-semibold">{t("Apply as a charity")}</div>
      <Field label={t("Organisation name")}>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("What you do")}>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label={t("Registration number (optional)")}>
        <Input value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} />
      </Field>
      <Field label={t("Website (optional)")}>
        <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
      </Field>
      {action.error && action.error !== tx.error && <Alert tone="bad">{action.error}</Alert>}
      <Button disabled={!name.trim() || tx.busy || action.pending} onClick={() => void submit()}>
         {t("Submit application")} </Button>
      <TxStatus tx={tx} />
    </Card>
  );
}


