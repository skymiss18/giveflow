import { createConfig, http, type CreateConnectorFn } from "wagmi";
import { foundry, sepolia } from "wagmi/chains";
import { injected, mock, walletConnect } from "wagmi/connectors";
import { CHAIN_ID, IS_LOCAL } from "@/lib/shared/chain";
import { DEV_ACCOUNTS } from "@/lib/shared/constants";
import { createWalletLogger } from "./wallet-logger";

const rpcOverride = process.env.NEXT_PUBLIC_RPC_URL || undefined;

// The mock dev connector talks to chain.rpcUrls.default, so the override must live on the chain itself.
export const chain = IS_LOCAL
  ? { ...foundry, rpcUrls: { default: { http: [rpcOverride ?? foundry.rpcUrls.default.http[0]] } } }
  : sepolia;

const wcProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
const devWallets = IS_LOCAL && process.env.NEXT_PUBLIC_DEV_WALLETS === "1";

/** Local-only signer that Anvil unlocks for its built-in accounts. */
function devWallet(label: string, address: `0x${string}`): CreateConnectorFn {
  const base = mock({ accounts: [address], features: { reconnect: true } });
  return (config) => ({ ...base(config), id: `dev-${address.toLowerCase()}`, name: label });
}

const connectors: CreateConnectorFn[] = [
  injected(),
  ...(wcProjectId && typeof window !== "undefined" ? [walletConnect({ projectId: wcProjectId, logger: createWalletLogger() })] : []),
  ...(devWallets ? DEV_ACCOUNTS.map((a) => devWallet(`Dev · ${a.label}`, a.address)) : []),
];

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors,
  transports: { [chain.id]: http(rpcOverride) } as Record<number, ReturnType<typeof http>>,
  ssr: true,
});

export { CHAIN_ID };
