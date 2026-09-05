import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("clean Neon deployment architecture", () => {
  const root = process.cwd();
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  it("has no Upstash runtime packages or source modules", () => {
    expect(packageJson.dependencies?.["@upstash/redis"]).toBeUndefined();
    expect(packageJson.dependencies?.["@upstash/ratelimit"]).toBeUndefined();
    expect(existsSync(resolve(root, "server/market/compactState.ts"))).toBe(false);
    expect(existsSync(resolve(root, "server/security/rateLimit.ts"))).toBe(false);
  });

  it("keeps one bundled standard JavaScript tRPC function generated from maintained source", () => {
    const handlerPath = resolve(root, "server/vercel/trpcHandler.ts");
    const functionPath = resolve(root, "api/trpc/[...path].js");
    expect(existsSync(handlerPath)).toBe(true);
    expect(existsSync(functionPath)).toBe(true);
    expect(readFileSync(resolve(root, "api/trpc/package.json"), "utf8")).toContain('"type": "commonjs"');
    expect(existsSync(resolve(root, "api/trpc/[...path].cjs"))).toBe(false);
    const handlerSource = readFileSync(handlerPath, "utf8");
    expect(handlerSource).toContain("createHTTPHandler");
    expect(handlerSource).toContain('basePath: "/api/trpc/"');
    expect(packageJson.scripts?.["build:vercel:function"]).toContain("--format=cjs");
    expect(packageJson.scripts?.["build:vercel:function"]).not.toContain("--packages=external");
    expect(packageJson.dependencies?.["iconv-lite"]).toBeDefined();
  });
});
