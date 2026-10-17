import { handle } from "@/lib/server/http";
import { getAdminOverview } from "@/lib/server/queries";

export function GET() {
  return handle(getAdminOverview);
}
