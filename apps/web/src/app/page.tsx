"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { useApi } from "@/lib/client/api";
import { formatUsdc } from "@/lib/shared/format";
import type { CampaignView, ProjectView, Stats } from "@/lib/shared/types";
import { CampaignCard } from "@/components/campaign-card";
import { ProjectCard } from "@/components/project-card";
import { Card, Stat } from "@/components/ui";

const STEPS = [
  {
    n: "1",
    title: "See the promise",
    body: "The merchant's donation rule, the charity project and its treasury address are public before you pay.",
  },
  {
    n: "2",
    title: "Pay once",
    body: "One transaction. The contract splits your payment between merchant, charity treasury and platform.",
  },
  {
    n: "3",
    title: "Follow the money",
    body: "Your order page links the payment to the on-chain donation, and to the project's evidence.",
  },
  {
    n: "4",
    title: "See the result",
    body: "Independent verifiers confirm delivery evidence. Hashes are public; beneficiary data never leaves private storage.",
  },
] as const;

export default function HomePage() {
  const { t } = useI18n();
  const stats = useApi<Stats>("/api/data/stats");
  const campaigns = useApi<CampaignView[]>("/api/data/campaigns?active=1");
  const projects = useApi<ProjectView[]>("/api/data/projects");

  return (
    <div className="space-y-16">
      <section className="rounded-3xl bg-ink px-8 py-14 text-cream">
        <div className="text-xs font-medium uppercase tracking-widest text-gold">{t("Web3 for Social Good · Idea Track")}</div>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
          {t("Make every act of kindness traceable, and every help verifiable.")}
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-mint">{t("Buying becomes giving: a rule on-chain splits each payment, and delivery proof closes the loop.")}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/shop" className="rounded-full bg-coral px-6 py-3 font-medium text-white hover:bg-coral-dark">
            {t("Browse the shop")}
          </Link>
          <Link href="/projects" className="rounded-full border border-cream/40 px-6 py-3 font-medium hover:bg-white/10">
            {t("Explore projects")}
          </Link>
        </div>
      </section>

      <section>
        <Card className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          <Stat label={t("Orders")} value={stats.data?.orders ?? "–"} />
          <Stat label={t("Donated (mUSDC)")} value={stats.data ? formatUsdc(stats.data.donated) : "–"} sub={t("settled on-chain")} />
          <Stat label={t("Projects")} value={stats.data?.projects ?? "–"} />
          <Stat
            label={t("Evidence verified")}
            value={stats.data ? `${stats.data.verifiedEvidence}/${stats.data.totalEvidence}` : "–"}
          />
        </Card>
      </section>

      <section>
        <h2 className="mb-6 text-2xl font-semibold">{t("How it works")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <Card key={s.n}>
              <div className="text-3xl font-semibold text-coral">{s.n}</div>
              <div className="mt-2 font-medium">{t(s.title)}</div>
              <p className="mt-1 text-sm text-ink-soft">{t(s.body)}</p>
            </Card>
          ))}
        </div>
      </section>

      {campaigns.data && campaigns.data.length > 0 && (
        <section>
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-2xl font-semibold">{t("Featured products")}</h2>
            <Link href="/shop" className="text-sm underline">
              {t("View all")}
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {campaigns.data.slice(0, 3).map((c) => (
              <CampaignCard key={c.campaignId} campaign={c} />
            ))}
          </div>
        </section>
      )}

      {projects.data && projects.data.length > 0 && (
        <section>
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-2xl font-semibold">{t("Projects you can follow")}</h2>
            <Link href="/projects" className="text-sm underline">
              {t("View all")}
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {projects.data.slice(0, 2).map((p) => (
              <ProjectCard key={p.projectId} project={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
