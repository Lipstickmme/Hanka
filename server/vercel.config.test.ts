import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel deployment configuration", () => {
  const config = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
    buildCommand?: string;
    outputDirectory?: string;
    functions?: Record<string, { includeFiles?: string }>;
    rewrites?: Array<{ source: string; destination: string }>;
  };

  it("builds without database access before the frontend output", () => {
    expect(config.buildCommand).toBe("pnpm run build:vercel:function && pnpm run build:vercel");
    expect(config.outputDirectory).toBe("dist/public");
    expect(config.functions?.["api/trpc/[...path].js"]?.includeFiles).toBe("drizzle/neon/**");
  });

  it("uses one standard bundled JavaScript API function and keeps API paths outside the SPA fallback", () => {
    expect(existsSync(resolve(process.cwd(), "server/vercel/trpcHandler.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "api/trpc/[...path].ts"))).toBe(false);
    expect(existsSync(resolve(process.cwd(), "api/trpc/[...path].js"))).toBe(true);
    expect(config.rewrites).toContainEqual({
      source: "/:path((?!api(?:/|$)).*)",
      destination: "/index.html",
    });
  });

  it("routes the user-supplied Ethos mark through a narrowly scoped production storage proxy", () => {
    expect(existsSync(resolve(process.cwd(), "api/manus-storage/[...path].js"))).toBe(true);
    expect(config.rewrites).toContainEqual({
      source: "/manus-storage/:path*",
      destination: "/api/manus-storage/:path*",
    });
  });
});
