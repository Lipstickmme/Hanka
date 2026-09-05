import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("preview HMR configuration", () => {
  it("disables the flaky preview HMR socket so the proxied marketplace stays error-free", () => {
    const source = readFileSync(resolve(process.cwd(), "server/_core/vite.ts"), "utf8");
    expect(source).toContain("hmr: false");
    expect(source).toContain('app.get("/@vite/client"');
    expect(source).toContain("export const createHotContext");
    expect(source).toContain("export const updateStyle = (id, content)");
    expect(source).not.toContain("clientPort: 443");
    expect(source).toContain("middlewareMode: true");
  });
});
