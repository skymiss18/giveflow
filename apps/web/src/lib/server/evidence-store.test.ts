import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { keccak256 } from "viem";

const dir = mkdtempSync(join(tmpdir(), "shanliu-"));
process.env.DATA_DIR = dir;
delete process.env.EVIDENCE_MASTER_KEY;

const { saveEvidence, readEvidence } = await import("./evidence-store");

describe("evidence store", () => {
  const plain = Buffer.from("DEMO delivery receipt, no personal data");
  const hash = keccak256(plain);

  beforeAll(() => saveEvidence(hash, plain));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("round-trips evidence without an encryption key", () => {
    expect(readEvidence(hash)?.equals(plain)).toBe(true);
  });

  it("stores plaintext on disk for demo use", async () => {
    const { readFileSync } = await import("node:fs");
    const raw = readFileSync(join(dir, "evidence", `${hash}.bin`));
    expect(raw.equals(plain)).toBe(true);
  });

  it("returns null for unknown hashes and rejects malformed ones", () => {
    expect(readEvidence(keccak256(Buffer.from("other")))).toBeNull();
    expect(() => readEvidence("0x1234")).toThrow();
  });

});
