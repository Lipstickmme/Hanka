/**
 * Reports what is actually deployed at the configured HANKA contract address.
 *
 * Both HANKA escrows end with `fallback() { revert NativeValueNotAccepted(); }`,
 * so calling a function the deployed contract does not implement reverts with
 * 0xa1d5007f rather than saying "no such function". That makes a wrong address
 * or a wrong ABI look like an arbitrary contract failure, which is how this
 * market broke twice. This decodes that case by name.
 *
 * Usage:
 *   pnpm arc:doctor
 *   HANKA_MARKET_V2_TESTNET_ADDRESS=0x... ARC_TESTNET_RPC_URL=https://... pnpm arc:doctor
 *
 * Read-only: it sends no transaction and needs no private key.
 */

import { createPublicClient, http, fallback, isAddress, parseAbi } from "viem";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const NETWORK_SOURCE = readFileSync(resolve("shared/arcNetwork.ts"), "utf8");
const constant = (name) => NETWORK_SOURCE.match(new RegExp(`${name} = "([^"]+)"`))?.[1] ?? "";

const CHAIN_ID = Number(NETWORK_SOURCE.match(/ARC_TESTNET_CHAIN_ID = ([\d_]+)/)?.[1].replace(/_/g, "") ?? 0);
const DEFAULT_ADDRESS = constant("HANKA_MARKET_V2_TESTNET_ADDRESS");
const PUBLIC_RPCS = [...NETWORK_SOURCE.matchAll(/"(https:\/\/rpc[^"]+)"/g)].map(m => m[1]);

const address = (
  process.env.HANKA_MARKET_V2_TESTNET_ADDRESS ||
  process.env.VITE_HANKA_MARKET_V2_TESTNET_ADDRESS ||
  process.env.VITE_ARC_TESTNET_ESCROW_ADDRESS ||
  DEFAULT_ADDRESS
).trim();

const rpcUrls = Array.from(
  new Set([
    ...String(process.env.ARC_TESTNET_RPC_URL || process.env.ARC_TESTNET_RPC_URLS || "")
      .split(/[,\s]+/)
      .map(entry => entry.trim())
      .filter(Boolean),
    ...PUBLIC_RPCS,
  ]),
);

if (!isAddress(address)) {
  console.error(`Configured address is not a valid EVM address: ${address}`);
  process.exit(1);
}

const chain = {
  id: CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: rpcUrls } },
};

const client = createPublicClient({
  chain,
  transport: fallback(rpcUrls.map(url => http(url, { timeout: 15_000, retryCount: 1 }))),
});

const v2Abi = parseAbi([
  "function bountyCount() view returns (uint256)",
  "function agreementCount() view returns (uint256)",
  "function defaultFeeBps() view returns (uint16)",
  "function paused() view returns (bool)",
  "function roleHolder(uint8) view returns (address)",
]);

const v1Abi = parseAbi([
  "function taskCount() view returns (uint256)",
  "function pointExchangeCount() view returns (uint256)",
  "function feeBps() view returns (uint16)",
  "function resolver() view returns (address)",
  "function owner() view returns (address)",
]);

const UNKNOWN_FUNCTION_SELECTOR = "0xa1d5007f";

/** Distinguishes "this contract has no such function" from a real failure. */
function explain(error) {
  const text = `${error?.message ?? ""} ${error?.details ?? ""} ${error?.shortMessage ?? ""}`;
  if (text.includes(UNKNOWN_FUNCTION_SELECTOR) || text.includes("NativeValueNotAccepted")) {
    return "not implemented by this contract (hit the catch-all fallback)";
  }
  if (/returned no data/i.test(text)) return "not implemented by this contract (empty revert)";
  return (error?.shortMessage ?? error?.message ?? "failed").split("\n")[0];
}

const probe = async (label, run) => {
  try {
    return { label, ok: true, value: await run() };
  } catch (error) {
    return { label, ok: false, value: explain(error) };
  }
};

const line = (label, value) => console.log(`  ${label.padEnd(22)} ${value}`);

console.log("\nHANKA Arc contract doctor");
console.log("─".repeat(60));
line("Address", address);
line("Expected chain id", String(CHAIN_ID));
line("RPC endpoints", rpcUrls.join(", "));

let chainId;
try {
  chainId = await client.getChainId();
} catch (error) {
  console.error(`\nCould not reach any RPC endpoint: ${explain(error)}`);
  console.error("Set ARC_TESTNET_RPC_URL to an endpoint you can reach, then run this again.");
  process.exit(2);
}
line("Reported chain id", chainId === CHAIN_ID ? `${chainId} (match)` : `${chainId} (MISMATCH)`);

const code = await client.getCode({ address });
if (!code || code === "0x") {
  console.log("\n  No bytecode at this address on this chain. Nothing is deployed here.");
  process.exit(3);
}
line("Bytecode", `${(code.length - 2) / 2} bytes`);

console.log("\nDialect probe");
console.log("─".repeat(60));
const v2 = await probe("bountyCount()", () => client.readContract({ address, abi: v2Abi, functionName: "bountyCount" }));
const v1 = await probe("taskCount()", () => client.readContract({ address, abi: v1Abi, functionName: "taskCount" }));
line(v2.label, v2.ok ? `${v2.value} records` : v2.value);
line(v1.label, v1.ok ? `${v1.value} records` : v1.value);

if (v2.ok) {
  console.log("\n  => HankaMarketV2 (dialect \"v2\")");
  console.log("\nContract state");
  console.log("─".repeat(60));
  for (const [label, run] of [
    ["agreementCount()", () => client.readContract({ address, abi: v2Abi, functionName: "agreementCount" })],
    ["defaultFeeBps()", () => client.readContract({ address, abi: v2Abi, functionName: "defaultFeeBps" })],
    ["paused()", () => client.readContract({ address, abi: v2Abi, functionName: "paused" })],
    ["arbiter (roleHolder 1)", () => client.readContract({ address, abi: v2Abi, functionName: "roleHolder", args: [1] })],
    ["treasury (roleHolder 4)", () => client.readContract({ address, abi: v2Abi, functionName: "roleHolder", args: [4] })],
  ]) {
    const result = await probe(label, run);
    line(result.label, String(result.value));
  }
} else if (v1.ok) {
  console.log("\n  => HankaArcEscrow (dialect \"v1\")");
  console.log("\nContract state");
  console.log("─".repeat(60));
  for (const [label, run] of [
    ["pointExchangeCount()", () => client.readContract({ address, abi: v1Abi, functionName: "pointExchangeCount" })],
    ["feeBps()", () => client.readContract({ address, abi: v1Abi, functionName: "feeBps" })],
    ["resolver()", () => client.readContract({ address, abi: v1Abi, functionName: "resolver" })],
    ["owner()", () => client.readContract({ address, abi: v1Abi, functionName: "owner" })],
  ]) {
    const result = await probe(label, run);
    line(result.label, String(result.value));
  }
} else {
  console.log("\n  => Neither HANKA escrow answered.");
  console.log("     There is a contract here, but it is not one this app knows.");
  console.log("     Check the address, or point the app at the right deployment via");
  console.log("     HANKA_MARKET_V2_TESTNET_ADDRESS.");
  process.exit(4);
}

console.log("\nThe app detects this dialect at runtime, so no code change is needed.\n");
