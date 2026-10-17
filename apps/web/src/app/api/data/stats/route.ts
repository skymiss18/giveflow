import { handle } from "@/lib/server/http";
import { getStats } from "@/lib/server/queries";

export function GET() {
  return handle(getStats);
}
