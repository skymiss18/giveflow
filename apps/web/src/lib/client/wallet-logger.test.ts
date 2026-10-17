import { afterEach, describe, expect, it, vi } from "vitest";
import { writeWalletLog } from "./wallet-logger";

afterEach(() => vi.restoreAllMocks());

describe("WalletConnect browser logging", () => {
  it("does not log expected modal cancellation or wallet rejection as an error", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    writeWalletLog({ level: 50, err: new Error("Connection request reset. Please try again.") });
    writeWalletLog({ level: 50, message: "Connection request reset. Please try again." });
    writeWalletLog({ level: 50, msg: "Connection request reset. Please try again." });
    writeWalletLog({ level: 50, err: { code: 4001 } });
    expect(error).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it("preserves readable genuine errors without logging the full SDK payload", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    writeWalletLog({ level: 50, err: { message: "Invalid project", code: 403 }, uri: "private-pairing-uri" });
    expect(error).toHaveBeenCalledWith("[WalletConnect]", "Invalid project (code 403)");
  });

  it("preserves warnings and gives empty errors a useful label", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    writeWalletLog({ level: 40, msg: "Relay disconnected" });
    writeWalletLog({ level: 50 });
    expect(warn).toHaveBeenCalledWith("[WalletConnect]", "Relay disconnected");
    expect(error).toHaveBeenCalledWith("[WalletConnect]", "Wallet connection failed");
  });
});