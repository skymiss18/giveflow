import { ADDRESS_RE, handle, requireParam } from "@/lib/server/http";
import { getTreasury } from "@/lib/server/queries";
import type { Hex } from "@/lib/shared/types";

export function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  return handle(async () => getTreasury(requireParam((await params).address, ADDRESS_RE, "address") as Hex));
}
