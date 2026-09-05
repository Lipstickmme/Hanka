import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARC_RPC_ALLOWED_METHODS,
  ARC_RPC_PROXY_PATH,
  ARC_TESTNET_PUBLIC_RPC_URLS,
  parseRpcUrlList,
  resolveArcRpcUrls,
  resolveArcUpstreamRpcUrls,
} from "../shared/arcNetwork";
import { rejectArcRpcPayload } from "./arc/rpcProxy";

const vercelFunction = readFileSync(resolve(process.cwd(), "api/arc-rpc/index.js"), "utf8");

describe("Arc RPC proxy", () => {
  it("forwards only read and gas-estimate methods", () => {
    for (const method of ARC_RPC_ALLOWED_METHODS) {
      expect(rejectArcRpcPayload({ method, params: [] })).toBeNull();
    }
    // Signing and broadcasting stay inside the user's wallet; forwarding them
    // would turn the endpoint into an open relay.
    for (const method of ["eth_sendRawTransaction", "eth_sendTransaction", "eth_sign", "personal_sign", "admin_peers"]) {
      expect(rejectArcRpcPayload({ method })).toBe(`Method not allowed: ${method}`);
    }
  });

  it("accepts a batch of allowed calls and rejects a batch containing anything else", () => {
    expect(rejectArcRpcPayload([{ method: "eth_chainId" }, { method: "eth_call" }])).toBeNull();
    expect(rejectArcRpcPayload([{ method: "eth_chainId" }, { method: "eth_sendRawTransaction" }])).toBe(
      "Method not allowed: eth_sendRawTransaction",
    );
    expect(rejectArcRpcPayload([])).toBe("Empty JSON-RPC payload");
    expect(rejectArcRpcPayload(Array.from({ length: 51 }, () => ({ method: "eth_chainId" })))).toBe("JSON-RPC batch too large");
    expect(rejectArcRpcPayload({ params: [] })).toBe("Missing JSON-RPC method");
    expect(rejectArcRpcPayload(["eth_chainId"])).toBe("Malformed JSON-RPC call");
  });

  it("keeps the standalone Vercel function's allowlist identical to the shared one", () => {
    // The Vercel function is standalone CommonJS and cannot import the shared
    // TypeScript module, so the two lists are checked against each other here.
    const listed = vercelFunction
      .slice(vercelFunction.indexOf("const ALLOWED_METHODS"), vercelFunction.indexOf("]);"))
      .match(/"([a-z0-9_]+)"/gi)
      ?.map(entry => entry.replaceAll('"', ""));
    expect(listed?.sort()).toEqual([...ARC_RPC_ALLOWED_METHODS].sort());
  });

  it("puts the same-origin path first so a browser read never needs a CORS preflight", () => {
    const urls = resolveArcRpcUrls({ origin: "https://hanka.example" });
    expect(urls[0]).toBe(`https://hanka.example${ARC_RPC_PROXY_PATH}`);
    expect(urls).toEqual(expect.arrayContaining([...ARC_TESTNET_PUBLIC_RPC_URLS]));
  });

  it("keeps public endpoints as a fallback when the app is served without the proxy", () => {
    expect(resolveArcRpcUrls({ origin: null })).toEqual([...ARC_TESTNET_PUBLIC_RPC_URLS]);
  });

  it("lets an operator prepend their own endpoints and ignores non-https entries", () => {
    expect(parseRpcUrlList("https://a.example, http://insecure.example  https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
    const upstream = resolveArcUpstreamRpcUrls({ ARC_TESTNET_RPC_URL: "https://private.example" });
    expect(upstream[0]).toBe("https://private.example");
    expect(upstream).toEqual(expect.arrayContaining([...ARC_TESTNET_PUBLIC_RPC_URLS]));
  });

  it("is mounted on the development server as well as on Vercel", () => {
    const app = readFileSync(resolve(process.cwd(), "server/_core/app.ts"), "utf8");
    expect(app).toContain("arcRpcProxyHandler");
    expect(app).toContain("ARC_RPC_PROXY_PATH");
  });
});
