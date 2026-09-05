import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("Arc market navigation", () => {
  it("uses a compact Opera-backed market introduction instead of the former large hero", () => {
    const page = read("client/src/components/ArcMarketWorkspace.tsx");
    expect(page).toContain("arc-market-intro");
    expect(page).toContain("arc-market-intro-underlay");
    expect(page).toContain("Fund proof. Settle onchain.");
    expect(page).not.toContain("arc-bright-hero");
  });

  it("shows uppercase bounty and point navigation while keeping activity private to connected wallets", () => {
    const header = read("client/src/components/ArcHeader.tsx");
    const page = read("client/src/components/ArcMarketWorkspace.tsx");
    expect(page).toContain('label: "BOUNTIES"');
    expect(page).toContain('label: "POINT EXCHANGE"');
    expect(page).toContain('label: "MY ACTIVITY"');
    // The dashboard is wallet-scoped, so its link appears only once connected.
    expect(header).toContain("{address ? (");
    expect(header).toContain('href="/arc/dashboard"');
    expect(header).toContain("MY ACTIVITY");
  });

  it("registers every route the app links to", () => {
    const app = read("client/src/App.tsx");
    const home = read("client/src/pages/Home.tsx");
    // Home has always linked to /arc/dashboard, but the route was never
    // registered, so the link resolved to the 404 page.
    expect(home).toContain('href="/arc/dashboard"');
    for (const route of ["/", "/market", "/operations", "/arc", "/arc/dashboard", "/404"]) {
      expect(app).toContain(`path="${route}"`);
    }
  });
});
