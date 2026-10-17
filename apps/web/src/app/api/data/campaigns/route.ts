import { ADDRESS_RE, handle, optionalParam } from "@/lib/server/http";
import { getCampaigns } from "@/lib/server/queries";

export function GET(req: Request) {
  return handle(() => {
    const q = new URL(req.url).searchParams;
    return getCampaigns({
      merchant: optionalParam(q.get("merchant"), ADDRESS_RE, "merchant"),
      activeOnly: q.get("active") === "1",
    });
  });
}
