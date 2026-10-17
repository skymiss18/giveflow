"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/context";
import { CHAIN_ID, findDeployment } from "@/lib/shared/chain";
import { Alert } from "./ui";

export function DeploymentGuard({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  if (findDeployment()) return <>{children}</>;
  return (
    <Alert tone="warn">
      <p className="font-medium">{t("No contracts are configured for chain {chainId}.", { chainId: CHAIN_ID })}</p>
      <p className="mt-1">{t("Deploy with forge script script/Deploy.s.sol --broadcast from the contracts folder, then run pnpm sync-abi and restart the app.")}</p>
    </Alert>
  );
}
