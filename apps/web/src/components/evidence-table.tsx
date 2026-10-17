"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";

import type { EvidenceView } from "@/lib/shared/types";
import { AddressLink, Badge, Card, EmptyState, HashText, statusTone, TxLink } from "./ui";

export function EvidenceTable({
  items,
  empty,
  action,
  showProject,
}: {
  items: EvidenceView[];
  empty: string;
  action?: (e: EvidenceView) => ReactNode;
  showProject?: boolean;
}) {
  const { t, statusLabel, evidenceKindLabel, formatDate } = useI18n();
  if (items.length === 0) return <EmptyState title={t(empty)} />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase text-ink-soft">
          <tr>
            {showProject && <th className="px-4 py-3">{t("Project")}</th>}
            <th className="px-4 py-3">{t("Type")}</th>
            <th className="px-4 py-3">{t("File")}</th>
            <th className="px-4 py-3">{t("Fingerprint")}</th>
            <th className="px-4 py-3">{t("Submitted at")}</th>
            <th className="px-4 py-3">{t("Status")}</th>
            <th className="px-4 py-3">{t("Verifier")}</th>
            <th className="px-4 py-3">{t("Tx")}</th>
            {action && <th className="px-4 py-3" />}
          </tr>
        </thead>
        <tbody>
          {items.map((e) => (
            <tr key={e.evidenceId} className="border-b border-line/60 last:border-0">
              {showProject && (
                <td className="px-4 py-3">
                  <Link href={`/projects/${e.projectId}`} className="underline">
                    #{e.projectId}
                  </Link>
                </td>
              )}
              <td className="px-4 py-3">{evidenceKindLabel(e.kind)}</td>
              <td className="px-4 py-3">{e.file ? `${e.file.name} (${Math.max(1, Math.round(e.file.size / 1024))} KB)` : "—"}</td>
              <td className="px-4 py-3">
                <HashText value={e.contentHash} />
              </td>
              <td className="px-4 py-3">{formatDate(e.submittedAt)}</td>
              <td className="px-4 py-3">
                <Badge tone={statusTone(e.status)}>{statusLabel(e.status)}</Badge>
              </td>
              <td className="px-4 py-3">{e.verifier ? <AddressLink address={e.verifier} /> : "—"}</td>
              <td className="px-4 py-3">
                <TxLink hash={e.txHash} />
              </td>
              {action && <td className="px-4 py-3 text-right">{action(e)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

