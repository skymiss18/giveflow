"use client";

import { useI18n } from "@/lib/i18n/context";
import { useApi } from "@/lib/client/api";
import type { OrderView } from "@/lib/shared/types";
import { OrderTable } from "@/components/order-table";
import { RequireWallet } from "@/components/wallet";
import { ErrorNote, Loading, PageHeader } from "@/components/ui";

export default function OrdersPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("My orders")} subtitle={t("Every purchase from your wallet, with a proof page that links to the on-chain donation.")} />
      <RequireWallet>{(address) => <Orders address={address} />}</RequireWallet>
    </>
  );
}

function Orders({ address }: { address: string }) {
  const { t } = useI18n();
  const { data, isLoading, error } = useApi<OrderView[]>(`/api/data/orders?buyer=${address}`);
  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  return <OrderTable orders={data ?? []} empty={t("You have no orders yet.")} />;
}
