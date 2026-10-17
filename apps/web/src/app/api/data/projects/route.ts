import { ADDRESS_RE, handle, optionalParam } from "@/lib/server/http";
import { getProjects } from "@/lib/server/queries";

export function GET(req: Request) {
  return handle(() =>
    getProjects({ charity: optionalParam(new URL(req.url).searchParams.get("charity"), ADDRESS_RE, "charity") }),
  );
}
