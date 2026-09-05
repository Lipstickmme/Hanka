"use strict";

/**
 * Read-only Arc Testnet JSON-RPC proxy.
 *
 * The browser used to call https://rpc.testnet.arc.io directly, so the whole
 * market went dark whenever that host refused the origin's CORS preflight, was
 * unreachable from a mobile network, or was briefly down — the user saw a raw
 * "Failed to fetch" dump instead of a market. Serving RPC from the app's own
 * origin removes the preflight and the third-party DNS lookup, and lets one
 * endpoint fail over to the next server-side.
 *
 * Only the read and gas-estimate methods below are forwarded. Signing and
 * broadcasting stay inside the user's wallet, so this endpoint can never move
 * funds and is not useful as a general-purpose relay.
 *
 * Kept in sync with shared/arcNetwork.ts by server/arc.rpc-proxy.test.ts;
 * Vercel functions are standalone CommonJS and cannot import the TypeScript
 * module directly.
 */

const ALLOWED_METHODS = new Set([
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
]);

const DEFAULT_UPSTREAMS = ["https://rpc.testnet.arc.io", "https://rpc.testnet.arc.network"];
const MAX_BODY_BYTES = 256 * 1024;
const MAX_BATCH_SIZE = 50;
const UPSTREAM_TIMEOUT_MS = 12_000;

function upstreamUrls() {
  const configured = String(process.env.ARC_TESTNET_RPC_URL || process.env.ARC_TESTNET_RPC_URLS || "")
    .split(/[,\s]+/)
    .map(entry => entry.trim())
    .filter(entry => /^https:\/\//i.test(entry) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(entry));
  return Array.from(new Set([...configured, ...DEFAULT_UPSTREAMS]));
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body) return JSON.parse(req.body);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return null;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Accepts a single JSON-RPC call or a batch; rejects anything not allowlisted. */
function rejectionFor(payload) {
  const calls = Array.isArray(payload) ? payload : [payload];
  if (!calls.length) return "Empty JSON-RPC payload";
  if (calls.length > MAX_BATCH_SIZE) return "JSON-RPC batch too large";
  for (const call of calls) {
    if (!call || typeof call !== "object") return "Malformed JSON-RPC call";
    if (typeof call.method !== "string") return "Missing JSON-RPC method";
    if (!ALLOWED_METHODS.has(call.method)) return `Method not allowed: ${call.method}`;
  }
  return null;
}

module.exports = async function arcRpcProxy(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "OPTIONS") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  let payload;
  try {
    payload = await readBody(req);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Invalid JSON body" });
    return;
  }
  if (!payload) {
    res.status(400).json({ error: "Missing JSON-RPC body" });
    return;
  }

  const rejection = rejectionFor(payload);
  if (rejection) {
    res.status(403).json({ error: rejection });
    return;
  }

  const body = JSON.stringify(payload);
  const errors = [];
  for (const url of upstreamUrls()) {
    try {
      const upstream = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
      if (!upstream.ok) {
        errors.push(`${url}: HTTP ${upstream.status}`);
        continue;
      }
      const text = await upstream.text();
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Arc-Rpc-Upstream", new URL(url).host);
      res.status(200).send(text);
      return;
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  console.error("[ArcRpcProxy] every upstream failed:", errors.join("; "));
  res.status(502).json({ error: "No Arc Testnet RPC endpoint responded", attempts: errors });
};

module.exports.ALLOWED_METHODS = ALLOWED_METHODS;
