import { verifyMessage } from "viem";
import { AUTH_WINDOW_SECONDS, authMessage, type AuthAction } from "@/lib/shared/auth";
import type { Hex } from "@/lib/shared/types";
import { CHAIN_ID } from "./chain";
import { ADDRESS_RE, HttpError } from "./http";

/** Verifies a wallet-signed request header set and returns the signer. */
export async function requireWallet(req: Request, action: AuthAction): Promise<Hex> {
  const address = req.headers.get("x-auth-address");
  const issued = Number(req.headers.get("x-auth-issued"));
  const signature = req.headers.get("x-auth-signature");
  if (!address || !ADDRESS_RE.test(address) || !signature || !Number.isInteger(issued)) {
    throw new HttpError(401, "Wallet authorization required");
  }
  if (Math.abs(Date.now() / 1000 - issued) > AUTH_WINDOW_SECONDS) {
    throw new HttpError(401, "Authorization expired, sign again");
  }
  const ok = await verifyMessage({
    address: address as Hex,
    message: authMessage(action, address, issued, CHAIN_ID),
    signature: signature as Hex,
  }).catch(() => false);
  if (!ok) throw new HttpError(401, "Invalid wallet signature");
  return address as Hex;
}
