import { isAddress } from "viem";
import { describe, expect, it } from "vitest";
import { getArcContractAddress } from "../client/src/lib/arcTestnet";
import { HANKA_MARKET_V2_TESTNET_ADDRESS, resolveArcUpstreamRpcUrls } from "../shared/arcNetwork";

/**
 * The configuration half of this check runs everywhere. The live bytecode probe
 * needs a reachable Arc Testnet endpoint, so it runs only when explicitly asked
 * for with ARC_LIVE_CONTRACT_CHECK=1 — a network-dependent assertion in the
 * default suite fails on every offline machine and CI runner without saying
 * anything about the code.
 */

const live = process.env.ARC_LIVE_CONTRACT_CHECK === "1";

describe("configured HANKA market contract", () => {
  it("is a valid address that the client resolves without any environment variable", () => {
    expect(isAddress(HANKA_MARKET_V2_TESTNET_ADDRESS)).toBe(true);
    // A missing build-time variable used to leave the market with no contract
    // at all; it now only loses the override.
    expect(getArcContractAddress()?.toLowerCase()).toBe(HANKA_MARKET_V2_TESTNET_ADDRESS.toLowerCase());
  });

  it("has at least one upstream RPC endpoint to read it through", () => {
    expect(resolveArcUpstreamRpcUrls({}).length).toBeGreaterThan(0);
  });

  it.runIf(live)(
    "has deployed bytecode on Arc Testnet",
    async () => {
      const errors: string[] = [];
      for (const url of resolveArcUpstreamRpcUrls(process.env)) {
        try {
          const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              method: "eth_getCode",
              params: [HANKA_MARKET_V2_TESTNET_ADDRESS, "latest"],
            }),
            signal: AbortSignal.timeout(12_000),
          });
          const payload = (await response.json()) as { result?: string; error?: unknown };
          expect(payload.error).toBeUndefined();
          expect(payload.result).toMatch(/^0x[0-9a-f]{20,}$/i);
          return;
        } catch (error) {
          errors.push(`${url}: ${error instanceof Error ? error.message : "failed"}`);
        }
      }
      throw new Error(`No Arc Testnet endpoint responded: ${errors.join("; ")}`);
    },
    30_000,
  );
});

describe("server-side contract configuration", () => {
  it("falls back to the reviewed deployment so bounty metadata is not silently disabled", async () => {
    const { configuredMarketAddress } = await import("./routers/arcBounty");
    expect(configuredMarketAddress({})).toBe(HANKA_MARKET_V2_TESTNET_ADDRESS);
    // Any of the historically used names still overrides it.
    for (const name of [
      "HANKA_MARKET_V2_TESTNET_ADDRESS",
      "HANKA_MARKET_V2_TESTNET_ADDRESS_2",
      "VITE_HANKA_MARKET_V2_TESTNET_ADDRESS",
      "VITE_ARC_TESTNET_ESCROW_ADDRESS",
    ]) {
      expect(configuredMarketAddress({ [name]: "0x1111111111111111111111111111111111111111" })).toBe(
        "0x1111111111111111111111111111111111111111",
      );
    }
    expect(configuredMarketAddress({ HANKA_MARKET_V2_TESTNET_ADDRESS: "not-an-address" })).toBe(
      HANKA_MARKET_V2_TESTNET_ADDRESS,
    );
  });
});
