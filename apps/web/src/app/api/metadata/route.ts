import { z } from "zod";
import { getDb } from "@/lib/server/db";
import { handle, HttpError } from "@/lib/server/http";
import { hashMetadata, metadataSchemas, type MetadataKind } from "@/lib/shared/metadata";

const MAX_BODY_BYTES = 20_000;

const bodySchema = z.object({
  kind: z.enum(Object.keys(metadataSchemas) as [keyof typeof metadataSchemas, ...(keyof typeof metadataSchemas)[]]),
  data: z.unknown(),
});

export function POST(req: Request) {
  return handle(async () => {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, "Payload too large");
    const body = bodySchema.safeParse(JSON.parse(raw));
    if (!body.success) throw new HttpError(400, "Unknown metadata kind");

    const parsed = metadataSchemas[body.data.kind].safeParse(body.data.data);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));

    const kind: MetadataKind = body.data.kind;
    const hash = hashMetadata(kind, parsed.data);
    getDb()
      .prepare("INSERT OR IGNORE INTO metadata (hash, kind, data, created_at) VALUES (?, ?, ?, ?)")
      .run(hash, kind, JSON.stringify(parsed.data), Math.floor(Date.now() / 1000));
    return { hash, kind, data: parsed.data };
  });
}
