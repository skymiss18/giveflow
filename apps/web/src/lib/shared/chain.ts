import { deployments } from "@/contracts/deployments";

export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 11155111);
export const IS_LOCAL = CHAIN_ID === 31337;

export function getDeployment() {
  const d = deployments[CHAIN_ID];
  if (!d) {
    throw new Error(
      `No deployment for chain ${CHAIN_ID}. Deploy the contracts and run "pnpm sync-abi" (see contracts/script/Deploy.s.sol).`,
    );
  }
  return d;
}

export function findDeployment() {
  return deployments[CHAIN_ID] ?? null;
}
