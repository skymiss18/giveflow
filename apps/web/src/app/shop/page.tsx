"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { useApi } from "@/lib/client/api";
import type { CampaignView } from "@/lib/shared/types";
import { CampaignCard } from "@/components/campaign-card";
import { EmptyState, ErrorNote, Loading, PageHeader, Tabs } from "@/components/ui";

export default function ShopPage() {
  const { t } = useI18n();
  const { data, isLoading, error } = useApi<CampaignView[]>("/api/data/campaigns");
  const [view, setView] = useState<"Open" | "All">("Open");

  const items = (data ?? []).filter((c) => (view === "All" ? c.isLatest : c.isLatest && c.status === "Active"));

  return (
    <>
      <PageHeader
        title={t("Shop")}
        subtitle={t("Every product publishes its donation rule on-chain. Pick one and see exactly where the money goes before you pay.")}
      />
      <Tabs tabs={["Open", "All"] as const} value={view} onChange={setView} />
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && items.length === 0 && (
        <EmptyState title={t("No products yet")}>{t("Merchants can publish products from the Merchant console.")}</EmptyState>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((c) => (
          <CampaignCard key={c.campaignId} campaign={c} />
        ))}
      </div>
    </>
  );
}
