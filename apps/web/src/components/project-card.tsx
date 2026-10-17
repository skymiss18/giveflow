"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n/context";
import { formatUsdc } from "@/lib/shared/format";
import type { ProjectView } from "@/lib/shared/types";
import { Badge, Card, statusTone } from "./ui";

export function ProjectCard({ project: p }: { project: ProjectView }) {
  const { t, statusLabel, categoryLabel } = useI18n();
  const target = BigInt(p.targetAmount);
  const received = BigInt(p.received);
  const pct = target > 0n ? Number((received * 100n) / target) : 0;
  return (
    <Link href={`/projects/${p.projectId}`} className="block">
      <Card className="h-full transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold">{p.meta?.title ?? t("Project #{id}", { id: p.projectId })}</h3>
          <Badge tone={statusTone(p.status)}>{statusLabel(p.status)}</Badge>
        </div>
        <div className="mt-1 text-sm text-ink-soft">
          {p.charityName ?? t("Charity")} · {categoryLabel(p.meta?.category ?? "General")}
          {p.meta?.location && <> · {p.meta.location}</>}
        </div>
        {p.meta?.summary && <p className="mt-3 line-clamp-3 text-sm">{p.meta.summary}</p>}
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink/10">
          <div className="h-full rounded-full bg-coral" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-ink-soft">
          <span>{formatUsdc(p.received)} {t("received")}</span>
          <span>{t("goal {amount}", { amount: formatUsdc(p.targetAmount) })}</span>
        </div>
        <div className="mt-3 text-xs text-ink-soft">
          {p.evidence.verified}/{p.evidence.submitted} {t("evidence verified")} · {t("{orders} orders", { orders: p.orders })}
        </div>
      </Card>
    </Link>
  );
}
