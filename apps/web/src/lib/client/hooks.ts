"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { Abi } from "viem";
import { useConnection, usePublicClient, useSignMessage, useWriteContract } from "wagmi";
import { friendlyError } from "@/lib/client/errors";
import { gasLimitWithHeadroom } from "@/lib/client/gas";
import { useI18n } from "@/lib/i18n/context";
import { authMessage, type AuthAction } from "@/lib/shared/auth";
import { CHAIN_ID, findDeployment } from "@/lib/shared/chain";
import type { Hex } from "@/lib/shared/types";

export type TxState = { status: "idle" | "signing" | "pending" | "success" | "error"; hash?: Hex; error?: string };

type WriteRequest = { address: Hex; abi: Abi | readonly unknown[]; functionName: string; args?: readonly unknown[] };

/** Simulates first so reverts surface as readable errors, then sends, waits, and refreshes queries. */
export function useTx() {
  const { t } = useI18n();
  const { address } = useConnection();
  const publicClient = usePublicClient();
  const { mutateAsync: write } = useWriteContract();
  const qc = useQueryClient();
  const [state, setState] = useState<TxState>({ status: "idle" });

  const send = useCallback(
    async (request: WriteRequest) => {
      if (!publicClient || !address) throw new Error("Connect a wallet first");
      setState({ status: "signing" });
      try {
        await publicClient.simulateContract({ ...(request as object), account: address } as never);
        const [estimate, accountCode] = await Promise.all([
          publicClient.estimateContractGas({ ...(request as object), account: address } as never),
          publicClient.getCode({ address }),
        ]);
        const gas = gasLimitWithHeadroom(estimate, accountCode);
        const hash = await write({ ...request, gas } as never);
        setState({ status: "pending", hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted on-chain");
        await qc.invalidateQueries();
        setState({ status: "success", hash });
        return receipt;
      } catch (e) {
        setState((current) => ({ ...current, status: "error", error: friendlyError(e) }));
        throw e;
      }
    },
    [address, publicClient, qc, write],
  );

  const track = useCallback(async (hash: Hex) => {
    if (!publicClient) throw new Error("No public client for the connected network");
    setState({ status: "pending", hash });
    try {
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted on-chain");
      await qc.invalidateQueries();
      setState({ status: "success", hash });
      return receipt;
    } catch (e) {
      setState((current) => ({ ...current, status: "error", error: friendlyError(e) }));
      throw e;
    }
  }, [publicClient, qc]);

  const reset = useCallback(() => setState({ status: "idle" }), []);
  return { ...state, error: state.error ? t(state.error) : undefined, busy: state.status === "signing" || state.status === "pending", send, track, reset };
}

const AUTH_CACHE_MS = 5 * 60 * 1000;

/** Returns headers proving wallet ownership for one API action; signatures are cached for five minutes. */
export function useWalletAuth() {
  const { address } = useConnection();
  const { mutateAsync: sign } = useSignMessage();

  return useCallback(
    async (action: AuthAction): Promise<Record<string, string>> => {
      if (!address) throw new Error("Connect a wallet first");
      const key = `giveflow:auth:v1:${CHAIN_ID}:${action}:${address.toLowerCase()}`;
      const cached = sessionStorage.getItem(key);
      if (cached) {
        const { issued, signature } = JSON.parse(cached) as { issued: number; signature: string };
        if (Date.now() - issued * 1000 < AUTH_CACHE_MS) {
          return { "x-auth-address": address, "x-auth-issued": String(issued), "x-auth-signature": signature };
        }
      }
      const issued = Math.floor(Date.now() / 1000);
      const signature = await sign({ message: authMessage(action, address, issued, CHAIN_ID) });
      sessionStorage.setItem(key, JSON.stringify({ issued, signature }));
      return { "x-auth-address": address, "x-auth-issued": String(issued), "x-auth-signature": signature };
    },
    [address, sign],
  );
}

export function useDeployment() {
  return findDeployment();
}

/** Current unix time in seconds, refreshed on an interval so renders stay pure. */
export function useNow(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Fetches a decrypted evidence file with a wallet-signed request and opens it in a new tab. */
export function useEvidenceViewer() {
  const auth = useWalletAuth();
  return useCallback(
    async (contentHash: string) => {
      const headers = await auth("evidence:read");
      const res = await fetch(`/api/evidence/${contentHash}/file`, { headers });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Could not open file (${res.status})`);
      }
      const url = URL.createObjectURL(await res.blob());
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    [auth],
  );
}

/** Wraps a form submit so any thrown error becomes a readable message. */
export function useAction() {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setError(null);
    setPending(true);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      setPending(false);
    }
  }, []);
  return { run, error: error ? t(error) : null, pending, clear: () => setError(null) };
}

/** Resolves a content-addressed note (purpose, verifier comment) to its text. */
export function useNote(hash: string | null | undefined) {
  const valid = !!hash && !/^0x0+$/.test(hash);
  return useQuery({
    queryKey: ["note", hash],
    enabled: valid,
    staleTime: Infinity,
    queryFn: async () => {
      const res = await fetch(`/api/metadata/${hash}`);
      if (!res.ok) return null;
      const body = (await res.json()) as { data: { text?: string } };
      return body.data.text ?? null;
    },
  }).data;
}
