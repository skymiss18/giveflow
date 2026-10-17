import { ADDRESS_RE, handle, HttpError, optionalParam } from "@/lib/server/http";
import { getParties } from "@/lib/server/queries";

export function GET(req: Request) {
  return handle(() => {
    const q = new URL(req.url).searchParams;
    const kind = q.get("kind");
    if (kind !== "merchant" && kind !== "charity") throw new HttpError(400, "kind must be merchant or charity");
    return getParties(kind, optionalParam(q.get("wallet"), ADDRESS_RE, "wallet"));
  });
}
