import { handle, optionalParam, UINT_RE } from "@/lib/server/http";
import { getEvidence } from "@/lib/server/queries";

export function GET(req: Request) {
  return handle(() => {
    const q = new URL(req.url).searchParams;
    return getEvidence({
      projectId: optionalParam(q.get("projectId"), UINT_RE, "projectId"),
      status: optionalParam(q.get("status"), /^(Submitted|Verified|Rejected)$/, "status"),
    });
  });
}
