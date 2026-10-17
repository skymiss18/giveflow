import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "./db";
import { HASH_RE, HttpError } from "./http";

const DIR = join(DATA_DIR, "evidence");
const IV_LEN = 12;
const TAG_LEN = 16;

function masterKey(): Buffer {
  const hex = process.env.EVIDENCE_MASTER_KEY;
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new HttpError(500, "EVIDENCE_MASTER_KEY must be set to 32 bytes of hex");
  }
  return Buffer.from(hex, "hex");
}

function fileKey(contentHash: string): Buffer {
  const salt = Buffer.from(contentHash.slice(2), "hex");
  return Buffer.from(hkdfSync("sha256", masterKey(), salt, "shanliu-evidence-v1", 32));
}

function pathFor(contentHash: string): string {
  if (!HASH_RE.test(contentHash)) throw new HttpError(400, "Invalid content hash");
  return join(DIR, `${contentHash.toLowerCase()}.enc`);
}

export function saveEvidence(contentHash: string, plaintext: Buffer): void {
  const path = pathFor(contentHash);
  mkdirSync(DIR, { recursive: true });
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", fileKey(contentHash.toLowerCase()), iv);
  const body = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  writeFileSync(path, Buffer.concat([iv, cipher.getAuthTag(), body]));
}

export function readEvidence(contentHash: string): Buffer | null {
  const path = pathFor(contentHash);
  if (!existsSync(path)) return null;
  const raw = readFileSync(path);
  const decipher = createDecipheriv("aes-256-gcm", fileKey(contentHash.toLowerCase()), raw.subarray(0, IV_LEN));
  decipher.setAuthTag(raw.subarray(IV_LEN, IV_LEN + TAG_LEN));
  return Buffer.concat([decipher.update(raw.subarray(IV_LEN + TAG_LEN)), decipher.final()]);
}
