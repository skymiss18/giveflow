import { describe, expect, it } from "vitest";
import { keccak256, toBytes } from "viem";
import { canonicalize, hashMetadata, productSchema } from "./metadata";
import { bpsToPercent, formatDuration, formatUsdc, parseUsdc, shortAddress } from "./format";
import { authMessage } from "./auth";

describe("canonicalize", () => {
  it("is independent of key order and drops undefined", () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: undefined, e: [3, { z: 1, y: 2 }] } })).toBe(
      '{"a":{"d":2,"e":[3,{"y":2,"z":1}]},"b":1}',
    );
  });
});

describe("hashMetadata", () => {
  it("binds kind and content", () => {
    const data = { name: "Kit", description: "" };
    expect(hashMetadata("product", data)).toBe(keccak256(toBytes('{"data":{"description":"","name":"Kit"},"kind":"product"}')));
    expect(hashMetadata("product", data)).not.toBe(hashMetadata("project", data));
    expect(hashMetadata("product", { ...data, name: "Kit 2" })).not.toBe(hashMetadata("product", data));
  });

  it("rejects invalid product input", () => {
    expect(productSchema.safeParse({ name: "" }).success).toBe(false);
    expect(productSchema.safeParse({ name: "ok", imageUrl: "not a url" }).success).toBe(false);
    expect(productSchema.safeParse({ name: "ok" }).data).toEqual({ name: "ok", description: "" });
  });
});

describe("format", () => {
  it("formats and parses 6-decimal amounts", () => {
    expect(formatUsdc(25_000_000n)).toBe("25.00");
    expect(formatUsdc("1234567890")).toBe("1,234.56789");
    expect(parseUsdc("0.5")).toBe(500_000n);
    expect(() => parseUsdc("1.1234567")).toThrow();
    expect(() => parseUsdc("-1")).toThrow();
    expect(() => parseUsdc("")).toThrow();
  });

  it("formats basis points, durations and addresses", () => {
    expect(bpsToPercent(500)).toBe("5%");
    expect(bpsToPercent(250)).toBe("2.5%");
    expect(formatDuration(0)).toBe("none");
    expect(formatDuration(86_400)).toBe("1 day");
    expect(formatDuration(3 * 86_400)).toBe("3 days");
    expect(shortAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")).toBe("0xf39F…2266");
  });
});

describe("authMessage", () => {
  it("includes action, wallet, chain and time so signatures cannot be reused across scopes", () => {
    const m = authMessage("evidence:read", "0xabc", 1700000000, 11155111);
    expect(m).toContain("Action: evidence:read");
    expect(m).toContain("Wallet: 0xabc");
    expect(m).toContain("Chain: 11155111");
    expect(m).toContain("Issued: 1700000000");
    expect(authMessage("evidence:upload", "0xabc", 1700000000, 11155111)).not.toBe(m);
  });
});
