import { isAddress } from "viem";
import { describe, expect, it } from "vitest";

const escrow = process.env.VITE_ARC_TESTNET_ESCROW_ADDRESS;

describe("configured HANKA Arc Testnet escrow", () => {
  it("is a valid address with deployed bytecode on the official Arc Testnet RPC", async () => {
    expect(escrow).toBeTruthy();
    expect(isAddress(escrow ?? "")).toBe(true);
    const response = await fetch("https://rpc.testnet.arc.io", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getCode", params: [escrow, "latest"] }),
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await response.json() as { result?: string; error?: unknown };
    expect(response.ok).toBe(true);
    expect(payload.error).toBeUndefined();
    expect(payload.result).toMatch(/^0x[0-9a-f]{20,}$/i);
  }, 15_000);
});
