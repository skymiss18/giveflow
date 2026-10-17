import type { Hex } from "viem";

export function gasLimitWithHeadroom(estimate: bigint, accountCode: Hex | undefined): bigint {
  const delegated = /^0xef0100[0-9a-f]{40}$/i.test(accountCode ?? "");
  const percent = delegated ? 300n : 120n;
  return (estimate * percent + 99n) / 100n;
}