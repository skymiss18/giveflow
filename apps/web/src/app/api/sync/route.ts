import { ensureSynced } from "@/lib/server/indexer";
import { handle } from "@/lib/server/http";

export function POST() {
  return handle(async () => {
    await ensureSynced(true);
    return { ok: true };
  });
}
