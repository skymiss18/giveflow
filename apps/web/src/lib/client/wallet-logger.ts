import pino from "pino";
import { isWalletConnectionCancelled } from "./errors";

export function writeWalletLog(record: object) {
  const entry = record as { level?: number; msg?: unknown; message?: unknown; code?: unknown; err?: unknown };
  if (isWalletConnectionCancelled(entry) || isWalletConnectionCancelled(entry.err) ||
    isWalletConnectionCancelled({ message: entry.msg })) return;
  const error = entry.err && typeof entry.err === "object"
    ? entry.err as { message?: unknown; code?: unknown } : entry;
  const message = typeof error.message === "string" ? error.message
    : typeof entry.msg === "string" ? entry.msg : "Wallet connection failed";
  const detail = typeof error.code === "number" ? `${message} (code ${error.code})` : message;
  if ((entry.level ?? 50) >= 50) console.error("[WalletConnect]", detail);
  else console.warn("[WalletConnect]", detail);
}

export function createWalletLogger() {
  return pino({ level: "warn", browser: { asObject: true, serialize: true, write: writeWalletLog } });
}