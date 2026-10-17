import { requireWallet } from "@/lib/server/auth";
import { handle, requireParam } from "@/lib/server/http";
import { claimStoreInvoice, getStorePayment } from "@/lib/server/pos";

const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
type Context = { params: Promise<{ id: string }> };

export function GET(_req: Request, { params }: Context) {
  return handle(async () => getStorePayment(requireParam((await params).id, ID_RE, "id")));
}

export function POST(req: Request, { params }: Context) {
  return handle(async () => {
    const wallet = await requireWallet(req, "pos:claim");
    return claimStoreInvoice(requireParam((await params).id, ID_RE, "id"), wallet);
  });
}