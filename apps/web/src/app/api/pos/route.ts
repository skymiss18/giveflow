import { requireWallet } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { createStoreInvoice } from "@/lib/server/pos";

export function POST(req: Request) {
  return handle(async () => {
    const wallet = await requireWallet(req, "pos:create");
    return createStoreInvoice(wallet, await req.json());
  });
}