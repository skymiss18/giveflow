import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./db";
import { HASH_RE, HttpError } from "./http";

const DIR = join(DATA_DIR, "evidence");
function pathFor(contentHash: string): string {
  if (!HASH_RE.test(contentHash)) throw new HttpError(400, "Invalid content hash");
  return join(DIR, `${contentHash.toLowerCase()}.bin`);
}

export function saveEvidence(contentHash: string, plaintext: Buffer): void {
  const path = pathFor(contentHash);
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path, plaintext);
}

export function readEvidence(contentHash: string): Buffer | null {
  const path = pathFor(contentHash);
  if (!existsSync(path)) return null;
  return readFileSync(path);
}
