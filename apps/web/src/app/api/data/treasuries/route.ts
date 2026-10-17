import { ADDRESS_RE, handle, requireParam } from "@/lib/server/http";
import { getTreasuriesFor } from "@/lib/server/queries";

export function GET(req: Request) {
  return handle(() => getTreasuriesFor(requireParam(new URL(req.url).searchParams.get("wallet"), ADDRESS_RE, "wallet")));
}
