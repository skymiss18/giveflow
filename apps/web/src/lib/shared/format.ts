import { formatUnits, parseUnits } from "viem";
import { USDC_DECIMALS } from "./constants";

export function formatUsdc(value: bigint | string | number): string {
  const [whole, frac = ""] = formatUnits(BigInt(value), USDC_DECIMALS).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${grouped}.${frac.padEnd(2, "0")}`;
}

export function parseUsdc(input: string): bigint {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,6})?$/.test(trimmed)) throw new Error("Enter a valid amount (up to 6 decimals)");
  return parseUnits(trimmed, USDC_DECIMALS);
}

export const shortAddress = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
export const shortHash = (h: string) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");

export function explorerBase(chainId: number): string | null {
  return chainId === 11155111 ? "https://sepolia.etherscan.io" : null;
}

export const formatDate = (unixSeconds: number, locale = "en-SG") =>
  new Date(unixSeconds * 1000).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

export function formatDuration(seconds: number, locale = "en"): string {
  if (locale === "zh") {
    if (seconds <= 0) return "无";
    if (seconds % 86400 === 0) return `${seconds / 86400} 天`;
    if (seconds % 3600 === 0) return `${seconds / 3600} 小时`;
    return `${seconds} 秒`;
  }
  if (seconds <= 0) return "none";
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} h`;
  return `${seconds} s`;
}

export const bpsToPercent = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
