import { ADDRESS_RE, handle, optionalParam, UINT_RE } from "@/lib/server/http";
import { getOrders } from "@/lib/server/queries";

export function GET(req: Request) {
  return handle(() => {
    const q = new URL(req.url).searchParams;
    return getOrders({
      buyer: optionalParam(q.get("buyer"), ADDRESS_RE, "buyer"),
      merchant: optionalParam(q.get("merchant"), ADDRESS_RE, "merchant"),
      campaignId: optionalParam(q.get("campaignId"), UINT_RE, "campaignId"),
      projectId: optionalParam(q.get("projectId"), UINT_RE, "projectId"),
    });
  });
}
