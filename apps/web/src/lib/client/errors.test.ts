import { describe, expect, it } from "vitest";
import { isWalletConnectionCancelled } from "./errors";

describe("wallet connection cancellation", () => {
  it("recognizes the SDK's QR modal close error", () => {
    expect(isWalletConnectionCancelled(new Error("Connection request reset. Please try again."))).toBe(true);
  });

  it("recognizes wallet rejection codes through wrapped causes", () => {
    expect(isWalletConnectionCancelled({ cause: { code: 4001 } })).toBe(true);
    expect(isWalletConnectionCancelled({ cause: { code: 5000 } })).toBe(true);
  });

  it("does not treat relay, project or timeout failures as cancellation", () => {
    for (const error of [new Error("Connection timed out"), { code: 401 }, { code: 403 }, { code: -32603 }, {}, null]) {
      expect(isWalletConnectionCancelled(error)).toBe(false);
    }
  });

  it("handles cyclic error causes", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(isWalletConnectionCancelled(error)).toBe(false);
  });
});