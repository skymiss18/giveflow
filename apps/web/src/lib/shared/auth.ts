export const AUTH_WINDOW_SECONDS = 600;

export type AuthAction = "evidence:upload" | "evidence:read" | "report:prepare" | "pos:create" | "pos:claim";

/** The exact text a wallet signs to authorize a single class of API action. */
export function authMessage(action: AuthAction, wallet: string, issuedAt: number, chainId: number): string {
  return [
    "GiveFlow authorization",
    `Action: ${action}`,
    `Wallet: ${wallet}`,
    `Chain: ${chainId}`,
    `Issued: ${issuedAt}`,
  ].join("\n");
}
