import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");

describe("Arc market navigation", () => {
  it("uses a compact Opera-backed market introduction instead of the former large hero", () => {
    const page = read("client/src/pages/ArcMarket.tsx");
    expect(page).toContain("arc-market-intro");
    expect(page).toContain("arc-market-intro-underlay");
    expect(page).toContain("Fund proof. Settle onchain.");
    expect(page).not.toContain("arc-bright-hero");
  });

  it("shows uppercase Bounty and point navigation while keeping activity private to connected wallets", () => {
    const page = read("client/src/pages/ArcMarket.tsx");
    expect(page).toContain(">BOUNTIES<");
    expect(page).toContain(">POINT EXCHANGE<");
    expect(page).toContain('{wallet ? <Link href="/arc/dashboard"');
    expect(page).toContain(">MY ACTIVITY<");
  });
});
