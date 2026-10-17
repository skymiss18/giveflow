import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keccak256 } from "viem";

const dir = mkdtempSync(join(tmpdir(), "shanliu-"));
process.env.DATA_DIR = dir;
process.env.EVIDENCE_MASTER_KEY = "11".repeat(32);

const { saveEvidence, readEvidence } = await import("./evidence-store");

describe("evidence store", () => {
  const plain = Buffer.from("DEMO delivery receipt, no personal data");
  const hash = keccak256(plain);

  beforeAll(() => saveEvidence(hash, plain));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("round-trips the file through encryption", () => {
    expect(readEvidence(hash)?.equals(plain)).toBe(true);
  });

  it("does not store plaintext on disk", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(join(dir, "evidence", `${hash}.enc`));
    expect(raw.includes(plain)).toBe(false);
    expect(raw.length).toBe(12 + 16 + plain.length);
  });

  it("returns null for unknown hashes and rejects malformed ones", () => {
    expect(readEvidence(keccak256(Buffer.from("other")))).toBeNull();
    expect(() => readEvidence("0x1234")).toThrow();
  });

  it("detects tampering", async () => {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const file = join(dir, "evidence", `${hash}.enc`);
    const raw = readFileSync(file);
    raw[raw.length - 1] ^= 0xff;
    writeFileSync(file, raw);
    expect(() => readEvidence(hash)).toThrow();
  });
});
