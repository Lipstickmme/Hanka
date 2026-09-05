/**
 * Single source of truth for Arc Testnet connection details.
 *
 * The browser, the Express dev server, and the Vercel JSON-RPC proxy all read
 * their endpoints from here so a network change never has to be made in three
 * places and then half-forgotten in one of them.
 */

export const ARC_TESTNET_CHAIN_ID = 5_042_002;
export const ARC_TESTNET_CHAIN_ID_HEX = "0x4cef52";
export const ARC_TESTNET_EXPLORER_URL = "https://testnet.arcscan.app";

/** Public Arc Testnet endpoints, tried in order when a request fails. */
export const ARC_TESTNET_PUBLIC_RPC_URLS = [
  "https://rpc.testnet.arc.io",
  "https://rpc.testnet.arc.network",
] as const;

/**
 * Same-origin JSON-RPC path. Reading through the app's own origin removes the
 * browser CORS negotiation and the third-party DNS lookup, which are the two
 * ways `fetch` fails on mobile networks and locked-down corporate Wi-Fi.
 */
export const ARC_RPC_PROXY_PATH = "/api/arc-rpc";

/**
 * The reviewed HankaMarketV2 deployment on Arc Testnet. Kept in source so a
 * missing environment variable degrades to the right contract instead of an
 * empty market, and overridable for anyone running their own deployment.
 */
export const HANKA_MARKET_V2_TESTNET_ADDRESS = "0x37ab7a189de40211647e5e1d1f22cbb18c23a51c";

/**
 * The Arc Testnet tokens HANKA knows how to display. `decimals` is a display
 * fallback only: every amount that reaches the contract is converted with the
 * decimals read from the token itself, and the token picker shows only the
 * addresses the deployed contract actually allowlists.
 */
export const ARC_TESTNET_TOKENS = [
  { symbol: "USDC", name: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 },
  { symbol: "EURC", name: "EURC", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6 },
  { symbol: "cirBTC", name: "Circle Wrapped Bitcoin", address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF", decimals: 8 },
] as const;

export type ArcTokenSymbol = (typeof ARC_TESTNET_TOKENS)[number]["symbol"];

/**
 * JSON-RPC methods the proxy will forward. Everything here is read-only or a
 * gas estimate: signing and broadcasting stay inside the user's own wallet, so
 * the proxy can never be used to move funds or to relay arbitrary traffic.
 */
export const ARC_RPC_ALLOWED_METHODS = [
  "eth_blockNumber",
  "eth_call",
  "eth_chainId",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_getBalance",
  "eth_getBlockByHash",
  "eth_getBlockByNumber",
  "eth_getCode",
  "eth_getLogs",
  "eth_getStorageAt",
  "eth_getTransactionByHash",
  "eth_getTransactionCount",
  "eth_getTransactionReceipt",
  "eth_maxPriorityFeePerGas",
  "net_version",
  "web3_clientVersion",
] as const;

/**
 * Splits a comma or whitespace separated endpoint list.
 *
 * Remote endpoints must be https so credentials and queries are never sent in
 * clear text; plain http is allowed only for loopback, where a developer runs a
 * local node such as Anvil or Hardhat.
 */
export function parseRpcUrlList(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(/[,\s]+/)
    .map(entry => entry.trim())
    .filter(entry => /^https:\/\//i.test(entry) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(entry));
}

/**
 * Builds the ordered endpoint list for a browser client. The same-origin proxy
 * goes first because it is the only entry that cannot fail on CORS; the public
 * endpoints stay behind it so the app still reads chain state when the proxy is
 * not deployed (a static-only host, say).
 */
export function resolveArcRpcUrls(options: { origin?: string | null; configured?: string | null } = {}): string[] {
  const configured = parseRpcUrlList(options.configured);
  const sameOrigin = options.origin ? [`${options.origin.replace(/\/+$/, "")}${ARC_RPC_PROXY_PATH}`] : [];
  return Array.from(new Set([...configured, ...sameOrigin, ...ARC_TESTNET_PUBLIC_RPC_URLS]));
}

/** Upstream endpoints the server-side proxy forwards to, in order. */
export function resolveArcUpstreamRpcUrls(env: Record<string, string | undefined> = {}): string[] {
  const configured = parseRpcUrlList(env.ARC_TESTNET_RPC_URL ?? env.ARC_TESTNET_RPC_URLS);
  return Array.from(new Set([...configured, ...ARC_TESTNET_PUBLIC_RPC_URLS]));
}

export const arcExplorerTxUrl = (hash: string) => `${ARC_TESTNET_EXPLORER_URL}/tx/${hash}`;
export const arcExplorerAddressUrl = (address: string) => `${ARC_TESTNET_EXPLORER_URL}/address/${address}`;
