import { getDb } from "@/lib/server/db";
import { handle, HASH_RE, HttpError, requireParam } from "@/lib/server/http";

export function GET(_req: Request, { params }: { params: Promise<{ hash: string }> }) {
  return handle(async () => {
    const hash = requireParam((await params).hash, HASH_RE, "hash");
    const row = getDb().prepare("SELECT kind, data FROM metadata WHERE hash = ?").get(hash) as
      | { kind: string; data: string }
      | undefined;
    if (!row) throw new HttpError(404, "Not found");
    return { hash, kind: row.kind, data: JSON.parse(row.data) };
  });
}
