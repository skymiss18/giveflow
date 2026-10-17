"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { useApi } from "@/lib/client/api";
import type { ProjectView } from "@/lib/shared/types";
import { ProjectCard } from "@/components/project-card";
import { EmptyState, ErrorNote, Loading, PageHeader, Tabs } from "@/components/ui";

export default function ProjectsPage() {
  const { t } = useI18n();
  const { data, isLoading, error } = useApi<ProjectView[]>("/api/data/projects");
  const [category, setCategory] = useState("All");

  const categories = ["All", ...Array.from(new Set((data ?? []).map((p) => p.meta?.category ?? "Other")))];
  const items = (data ?? []).filter((p) => category === "All" || (p.meta?.category ?? "Other") === category);

  return (
    <>
      <PageHeader
        title={t("Projects")}
        subtitle={t("Charitable causes of every kind. Each project publishes its treasury address, the donations it received, and the evidence that the help was delivered.")}
      />
      {categories.length > 2 && <Tabs tabs={categories} value={category} onChange={setCategory} />}
      {isLoading && <Loading />}
      {error && <ErrorNote error={error} />}
      {data && items.length === 0 && <EmptyState title={t("No projects yet")}>{t("Approved charities create projects from the Charity console.")}</EmptyState>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((p) => <ProjectCard key={p.projectId} project={p} />)}
      </div>
    </>
  );
}
