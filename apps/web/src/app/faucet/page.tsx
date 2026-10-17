"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n/context";
import { useConnection, useReadContract } from "wagmi";
import { contracts } from "@/lib/client/contracts";
import { useTx } from "@/lib/client/hooks";
import { formatUsdc, parseUsdc } from "@/lib/shared/format";
import { RequireWallet } from "@/components/wallet";
import { Alert, Button, Card, Field, Input, PageHeader, TxStatus } from "@/components/ui";

export default function FaucetPage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader
        title={t("Test token faucet")}
        subtitle={t("mUSDC is a worthless test token for this demo. You also need a little test ETH for network fees.")}
      />
      <RequireWallet>{() => <Faucet />}</RequireWallet>
    </>
  );
}

function Faucet() {
  const { t } = useI18n();
  const { address } = useConnection();
  const k = useMemo(() => contracts(), []);
  const tx = useTx();
  const [amount, setAmount] = useState("500");
  const balance = useReadContract({
    ...k.usdc,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 6_000 },
  });

  let parsed: bigint | null = null;
  let problem: string | null = null;
  try {
    parsed = parseUsdc(amount);
    if (parsed > 1_000_000_000n) problem = "The faucet limit is 1,000 mUSDC per request.";
  } catch (e) {
    problem = (e as Error).message;
  }

  return (
    <Card className="max-w-md space-y-4">
      <div className="text-sm text-ink-soft">
         {t("Balance:")} <b className="text-ink">{balance.data !== undefined ? formatUsdc(balance.data) : "..."} mUSDC</b>
      </div>
      <Field label={t("Amount (max 1,000)")}>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
      </Field>
      {problem && <Alert tone="warn">{t(problem)}</Alert>}
      <Button
        disabled={!!problem || !parsed || tx.busy || !address}
        onClick={() => void tx.send({ ...k.usdc, functionName: "faucet", args: [address!, parsed!] }).catch(() => undefined)}
      >
         {t("Get")} {amount || "0"} mUSDC
      </Button>
      <TxStatus tx={tx} />
      <p className="text-xs text-ink-soft">
         {t("Need Sepolia ETH for network fees? Use any public Sepolia faucet; this app never asks for real funds.")} </p>
    </Card>
  );
}



