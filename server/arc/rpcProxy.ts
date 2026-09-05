import type { Request, Response } from "express";
import { ARC_RPC_ALLOWED_METHODS, resolveArcUpstreamRpcUrls } from "../../shared/arcNetwork";

/**
 * Development-server twin of api/arc-rpc/index.js.
 *
 * Vercel serves the standalone CommonJS function in production; this handler
 * gives `pnpm dev` the same same-origin RPC path so the market behaves
 * identically in both. Both forward the same read-only allowlist, which
 * server/arc.rpc-proxy.test.ts keeps in step.
 */

const ALLOWED_METHODS = new Set<string>(ARC_RPC_ALLOWED_METHODS);
const MAX_BATCH_SIZE = 50;
const UPSTREAM_TIMEOUT_MS = 12_000;

type JsonRpcCall = { method?: unknown };

export function rejectArcRpcPayload(payload: unknown): string | null {
  const calls = (Array.isArray(payload) ? payload : [payload]) as JsonRpcCall[];
  if (!calls.length) return "Empty JSON-RPC payload";
  if (calls.length > MAX_BATCH_SIZE) return "JSON-RPC batch too large";
  for (const call of calls) {
    if (!call || typeof call !== "object") return "Malformed JSON-RPC call";
    if (typeof call.method !== "string") return "Missing JSON-RPC method";
    if (!ALLOWED_METHODS.has(call.method)) return `Method not allowed: ${call.method}`;
  }
  return null;
}

export async function arcRpcProxyHandler(req: Request, res: Response) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = req.body as unknown;
  if (!payload) {
    res.status(400).json({ error: "Missing JSON-RPC body" });
    return;
  }
  const rejection = rejectArcRpcPayload(payload);
  if (rejection) {
    res.status(403).json({ error: rejection });
    return;
  }

  const body = JSON.stringify(payload);
  const errors: string[] = [];
  for (const url of resolveArcUpstreamRpcUrls(process.env)) {
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
      res.setHeader("Content-Type", "application/json");
      res.setHeader("X-Arc-Rpc-Upstream", new URL(url).host);
      res.status(200).send(await upstream.text());
      return;
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  console.error("[ArcRpcProxy] every upstream failed:", errors.join("; "));
  res.status(502).json({ error: "No Arc Testnet RPC endpoint responded", attempts: errors });
}
