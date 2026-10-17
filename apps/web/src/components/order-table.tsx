"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";
import { formatUsdc } from "@/lib/shared/format";
import type { OrderView } from "@/lib/shared/types";
import { Badge, Card, EmptyState, statusTone } from "./ui";

export function OrderTable({ orders, empty, action }: { orders: OrderView[]; empty: string; action?: (o: OrderView) => ReactNode }) {
  const { t, statusLabel, formatDate } = useI18n();
  if (orders.length === 0) return <EmptyState title={t(empty)} />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs uppercase text-ink-soft">
          <tr>
            <th className="px-4 py-3">{t("Product")}</th>
            <th className="px-4 py-3">{t("Qty")}</th>
            <th className="px-4 py-3">{t("Paid")}</th>
            <th className="px-4 py-3">{t("Donated")}</th>
            <th className="px-4 py-3">{t("Status")}</th>
            <th className="px-4 py-3">{t("Date")}</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.paymentId} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3">{o.productName ?? t("Campaign #{value0}", { value0: o.campaignId })}</td>
              <td className="px-4 py-3">{o.quantity}</td>
              <td className="px-4 py-3">{formatUsdc(o.gross)}</td>
              <td className="px-4 py-3">{formatUsdc(o.donation)}</td>
              <td className="px-4 py-3">
                <Badge tone={statusTone(o.status)}>{statusLabel(o.status)}</Badge>
              </td>
              <td className="px-4 py-3">{formatDate(o.timestamp)}</td>
              <td className="space-x-3 px-4 py-3 text-right">
                {action?.(o)}
                <Link href={`/orders/${o.paymentId}`} className="underline">
                  {t("Proof")}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
