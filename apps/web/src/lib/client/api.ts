"use client";

import { useQuery } from "@tanstack/react-query";

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

export async function apiPost<T>(path: string, payload: unknown, headers: Record<string, string> = {}): Promise<T> {
  const isForm = payload instanceof FormData;
  const res = await fetch(path, {
    method: "POST",
    headers: isForm ? headers : { "content-type": "application/json", ...headers },
    body: isForm ? payload : JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

/** Polls a read endpoint; pass `null` to disable until inputs (e.g. a wallet) are ready. */
export function useApi<T>(path: string | null, refetchMs = 8_000) {
  return useQuery<T>({
    queryKey: ["api", path],
    queryFn: () => apiGet<T>(path as string),
    enabled: path !== null,
    refetchInterval: refetchMs,
    staleTime: 0,
  });
}
