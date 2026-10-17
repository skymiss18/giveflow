import { createPublicClient, http } from "viem";
import { foundry, sepolia } from "viem/chains";
import { CHAIN_ID, IS_LOCAL } from "@/lib/shared/chain";

export const chain = IS_LOCAL ? foundry : sepolia;

const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || undefined;

const g = globalThis as unknown as { __shanliuClient?: ReturnType<typeof makeClient> };

function makeClient() {
  return createPublicClient({ chain, transport: http(rpcUrl, { batch: true }) });
}

export const publicClient = (g.__shanliuClient ??= makeClient());

export { CHAIN_ID };
