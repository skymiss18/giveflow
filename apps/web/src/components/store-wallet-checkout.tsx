"use client";

import type EthereumProvider from "@walletconnect/ethereum-provider";
import { useEffect, useRef, useState } from "react";
import { Smartphone, Unplug } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { isAddressEqual, type Address, type Hex } from "viem";
import { usePublicClient } from "wagmi";
import { friendlyError } from "@/lib/client/errors";
import { chain } from "@/lib/client/wagmi";
import {
  assertStoreWalletIdentity, createStoreWalletProvider, disposeStoreWalletProvider,
  payWithStoreWallet, storeWalletBuyer, type StoreWalletProgress,
} from "@/lib/client/store-wallet";
import { useI18n } from "@/lib/i18n/context";
import type { StoreInvoice } from "@/lib/shared/pos";
import type { CampaignView } from "@/lib/shared/types";
import { AddressLink, Alert, Button, TxLink } from "./ui";

type SessionState = {
  phase: "idle" | "connecting" | "connected" | "paying" | "verifying" | "error";
  uri?: string;
  buyer?: Address;
  progress?: StoreWalletProgress;
  hash?: Hex;
  error?: string;
};

export function StoreWalletCheckout({ invoice, campaign }: { invoice: StoreInvoice; campaign: CampaignView }) {
  const { t } = useI18n();
  const publicClient = usePublicClient({ chainId: invoice.chainId });
  const providerRef = useRef<EthereumProvider | null>(null);
  const generation = useRef(0);
  const [session, setSession] = useState<SessionState>({ phase: "idle" });
  const configured = !!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

  useEffect(() => () => {
    generation.current++;
    const provider = providerRef.current;
    providerRef.current = null;
    if (provider) void disposeStoreWalletProvider(provider);
  }, []);

  async function reset(error?: string) {
    generation.current++;
    const provider = providerRef.current;
    providerRef.current = null;
    setSession({ phase: error ? "error" : "idle", error });
    if (provider) await disposeStoreWalletProvider(provider);
  }

  async function connect() {
    const attempt = ++generation.current;
    setSession({ phase: "connecting" });
    try {
      if (Date.now() / 1000 > invoice.expiresAt) throw new Error("This payment request has expired");
      const rpc = process.env.NEXT_PUBLIC_RPC_URL || chain.rpcUrls.default.http[0];
      const provider = await createStoreWalletProvider(invoice, rpc, (uri) => {
        if (attempt === generation.current) setSession({ phase: "connecting", uri });
      });
      if (attempt !== generation.current) {
        await disposeStoreWalletProvider(provider);
        return;
      }
      providerRef.current = provider;
      provider.on("chainChanged", (network: string) => {
        if (attempt === generation.current && Number(network) !== invoice.chainId) void reset("Customer wallet is on the wrong network");
      });
      provider.on("disconnect", () => {
        if (attempt === generation.current) void reset("Customer wallet is disconnected");
      });
      await provider.connect();
      if (attempt !== generation.current) {
        await disposeStoreWalletProvider(provider);
        return;
      }
      const buyer = storeWalletBuyer(provider);
      assertStoreWalletIdentity(invoice, buyer, provider.chainId);
      provider.on("accountsChanged", () => {
        if (attempt !== generation.current) return;
        try {
          if (!isAddressEqual(storeWalletBuyer(provider), buyer)) void reset("Customer wallet changed. Scan again.");
        } catch {
          void reset("Customer wallet is disconnected");
        }
      });
      setSession({ phase: "connected", buyer });
    } catch (error) {
      if (attempt === generation.current) await reset(friendlyError(error));
    }
  }

  async function pay() {
    const provider = providerRef.current;
    if (!provider || !publicClient || !session.buyer || session.phase !== "connected") return;
    const attempt = generation.current;
    const buyer = session.buyer;
    setSession({ phase: "paying", buyer, progress: "Authorizing order" });
    try {
      const hash = await payWithStoreWallet({
        provider, publicClient, invoice, campaign, buyer,
        isActive: () => attempt === generation.current && providerRef.current === provider,
        onProgress: (progress, hash) => {
          if (attempt === generation.current) setSession({ phase: "paying", buyer, progress, hash });
        },
      });
      if (attempt !== generation.current) return;
      generation.current++;
      providerRef.current = null;
      setSession({ phase: "verifying", buyer, hash, progress: "Verifying payment" });
      await disposeStoreWalletProvider(provider);
    } catch (error) {
      if (attempt === generation.current) {
        setSession((current) => ({ ...current, phase: "connected", progress: undefined, error: friendlyError(error) }));
      }
    }
  }

  const busy = session.phase === "paying" || session.phase === "verifying";

  return (
    <div className="space-y-4">
      {!configured && <Alert tone="warn">{t("Wallet APP checkout requires a WalletConnect Project ID")}</Alert>}
      {session.error && <Alert tone="bad">{t(session.error)}</Alert>}
      {(session.phase === "idle" || session.phase === "error") && (
        <Button disabled={!configured || !publicClient} onClick={() => void connect()}><Smartphone size={16} aria-hidden="true" />{t("Connect customer wallet")}</Button>
      )}
      {session.phase === "connecting" && (
        <>
          {session.uri ? (
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex h-64 w-64 shrink-0 items-center justify-center rounded-lg border border-line bg-white p-3">
                <QRCodeSVG value={session.uri} size={228} marginSize={4} level="M" role="img" aria-label={t("Wallet APP connection QR")} title={t("Wallet APP connection QR")} />
              </div>
              <div className="text-sm text-ink-soft">{t("Waiting for customer wallet")}</div>
            </div>
          ) : <div role="status" className="text-sm text-ink-soft">{t("Preparing wallet connection")}</div>}
        </>
      )}
      {session.buyer && <div className="flex flex-wrap items-center gap-2 text-sm"><span>{t("Customer wallet")}</span><AddressLink address={session.buyer} /></div>}
      {session.phase === "connected" && <Button disabled={!publicClient} onClick={() => void pay()}>{t("Request payment in wallet")}</Button>}
      {busy && <Alert>{session.progress && t(session.progress)}</Alert>}
      {session.hash && <div className="space-y-2 text-sm"><TxLink hash={session.hash} /><p className="text-xs text-ink-soft">{t("Submitted transactions may still complete after disconnection.")}</p></div>}
      {(session.phase === "connecting" || session.phase === "connected" || session.phase === "paying") && (
        <button type="button" onClick={() => void reset()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm hover:bg-mint-soft">
          <Unplug size={16} aria-hidden="true" />{t("Disconnect customer wallet")}
        </button>
      )}
    </div>
  );
}