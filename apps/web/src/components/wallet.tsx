"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, LogOut, Wallet } from "lucide-react";
import { useConnect, useConnection, useConnectors, useDisconnect, useSwitchChain } from "wagmi";
import { useI18n } from "@/lib/i18n/context";
import { chain } from "@/lib/client/wagmi";
import { useApi } from "@/lib/client/api";
import { useDeployment } from "@/lib/client/hooks";
import { friendlyError, isWalletConnectionCancelled } from "@/lib/client/errors";
import { shortAddress } from "@/lib/shared/format";
import type { AdminOverview, PartyView } from "@/lib/shared/types";
import { Alert, Button } from "./ui";

export function ConnectButton() {
  const { t } = useI18n();
  const { address, isConnected, chainId, connector } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending, error } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const { mutate: switchChain, isPending: switching } = useSwitchChain();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    const wrongChain = chainId !== chain.id;
    return (
      <div className="flex items-center gap-2">
        {wrongChain && (
          <Button variant="danger" disabled={switching} onClick={() => switchChain({ chainId: chain.id })}>
            {t("Switch to {chain}", { chain: chain.name })}
          </Button>
        )}
        <span className="hidden h-9 items-center rounded-lg border border-line bg-paper px-2.5 font-mono text-xs sm:inline-flex" title={connector?.name}>
          {shortAddress(address)}
        </span>
        <button type="button" className="inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line bg-paper px-3 text-xs font-medium text-ink transition-colors hover:border-ink/30 hover:bg-mint-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink" onClick={() => disconnect()}>
          <LogOut size={15} strokeWidth={1.75} aria-hidden="true" />
          {t("Disconnect")}
        </button>
      </div>
    );
  }

  const real = connectors.filter((c) => !c.id.startsWith("dev-"));
  const dev = connectors.filter((c) => c.id.startsWith("dev-"));

  return (
    <div className="relative">
      <button
        type="button"
        className="inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-ink bg-ink px-2 text-xs font-medium text-paper shadow-sm transition-colors hover:border-ink-soft hover:bg-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-wait disabled:opacity-60 sm:px-3"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}
        aria-expanded={open}
        disabled={isPending}
      >
        <Wallet size={16} strokeWidth={1.75} aria-hidden="true" />
        {isPending ? t("Connecting…") : t("Connect wallet")}
        <ChevronDown size={13} className={`hidden transition-transform sm:block ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-paper p-1.5 shadow-lg">
          {real.map((c) => (
            <button
              key={c.uid}
              className="block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-mint-soft"
              onClick={() => {
                connect({ connector: c, chainId: chain.id });
                setOpen(false);
              }}
            >
              {c.name}
            </button>
          ))}
          {dev.length > 0 && (
            <>
              <div className="mt-2 border-t border-line px-3 pt-2 text-xs font-medium uppercase text-ink-soft">
                {t("Local dev wallets")}
              </div>
              {dev.map((c) => (
                <button
                  key={c.uid}
                  className="block w-full rounded-xl px-3 py-1.5 text-left text-sm hover:bg-mint-soft"
                  onClick={() => {
                    connect({ connector: c, chainId: chain.id });
                    setOpen(false);
                  }}
                >
                  {t(c.name)}
                </button>
              ))}
            </>
          )}
        </div>
      )}
      {error && !open && !isPending && !isWalletConnectionCancelled(error) && (
        <div role="alert" className="absolute right-0 z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-paper px-3 py-2 text-xs text-coral-dark shadow-lg">
          {t(friendlyError(error))}
        </div>
      )}
    </div>
  );
}

/** Blocks a page until a wallet on the right network is connected. */
export function RequireWallet({ children, message }: { children: (address: `0x${string}`) => ReactNode; message?: string }) {
  const { t } = useI18n();
  const { address, isConnected, chainId } = useConnection();
  const { mutate: switchChain } = useSwitchChain();
  if (!isConnected || !address) {
    return <Alert>{message ?? t("Connect your wallet to continue.")}</Alert>;
  }
  if (chainId !== chain.id) {
    return (
      <Alert tone="warn">
        {t("Your wallet is on the wrong network.")} {" "}
        <button className="underline" onClick={() => switchChain({ chainId: chain.id })}>
          {t("Switch to {chain}", { chain: chain.name })}
        </button>
      </Alert>
    );
  }
  return <>{children(address)}</>;
}

export type Roles = { merchant: PartyView | null; charity: PartyView | null; isAdmin: boolean; isVerifier: boolean; loading: boolean };

export function useRoles(address?: string): Roles {
  const dep = useDeployment();
  const q = address ? `wallet=${address}` : null;
  const merchant = useApi<PartyView[]>(q && `/api/data/parties?kind=merchant&${q}`, 15_000);
  const charity = useApi<PartyView[]>(q && `/api/data/parties?kind=charity&${q}`, 15_000);
  const admin = useApi<AdminOverview>(address ? "/api/data/admin" : null, 15_000);
  const lower = address?.toLowerCase();
  return {
    merchant: merchant.data?.[0] ?? null,
    charity: charity.data?.[0] ?? null,
    isAdmin: !!lower && dep?.admin.toLowerCase() === lower,
    isVerifier: !!lower && !!admin.data?.verifiers.some((v) => v.toLowerCase() === lower),
    loading: merchant.isLoading || charity.isLoading || admin.isLoading,
  };
}
