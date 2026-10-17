import { handle, HttpError } from "@/lib/server/http";
import { relayCheckout } from "@/lib/server/relay";

export const runtime = "nodejs";

async function readBody(req: Request): Promise<string> {
  const declaredSize = Number(req.headers.get("content-length") ?? 0);
  if (declaredSize > 8_192) throw new HttpError(413, "Relay request is too large");
  if (!req.body) throw new HttpError(400, "Invalid relay request");

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8_192) {
      await reader.cancel();
      throw new HttpError(413, "Relay request is too large");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export function POST(req: Request) {
  return handle(async () => {
    const raw = await readBody(req);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid relay request");
    }
    return relayCheckout(req, body);
  });
}