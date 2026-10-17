import { describe, expect, it } from "vitest";
import { gasLimitWithHeadroom } from "./gas";

describe("transaction gas headroom", () => {
  it("rounds ordinary-account estimates up with a 20 percent buffer", () => {
    expect(gasLimitWithHeadroom(100_000n, undefined)).toBe(120_000n);
    expect(gasLimitWithHeadroom(101n, "0x")).toBe(122n);
  });

  it("reserves execution overhead for an EIP-7702 delegated account", () => {
    const delegation = "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b";
    expect(gasLimitWithHeadroom(243_264n, delegation)).toBe(729_792n);
  });

  it("does not mistake arbitrary contract bytecode for a delegation designator", () => {
    expect(gasLimitWithHeadroom(100_000n, "0x60806040")).toBe(120_000n);
    expect(gasLimitWithHeadroom(100_000n, "0xef0100")).toBe(120_000n);
  });
});