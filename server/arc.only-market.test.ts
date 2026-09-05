import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Arc-only marketplace", () => {
  it("routes historical public market URLs into the unified Arc market", () => {
    expect(read("client/src/App.tsx")).toContain('<Redirect to="/arc" replace />');
    expect(read("client/src/pages/Market.tsx")).toContain('<Redirect to="/arc" replace />');
    expect(read("client/src/pages/Operations.tsx")).toContain('<Redirect to="/arc/dashboard" replace />');
  });

  it("keeps social proof in the funded Arc Bounty lifecycle without a manual OTC sender", () => {
    const market = read("client/src/pages/ArcMarket.tsx");
    const wallet = read("client/src/lib/arcTestnet.ts");
    const walletControl = read("client/src/components/ArcWalletConnect.tsx");
    expect(market).toContain("Fund proof. Settle onchain.");
    expect(market).toContain("trpc.arcBounty.metadata");
    expect(market).toContain("register.mutateAsync");
    expect(market).toContain("ArcWalletConnect");
    expect(walletControl).toContain("Connect EVM wallet");
    expect(market).toContain("No sample Bounties are invented.");
    expect(market).toContain("SELL SOCIAL PROOF");
    expect(market).toContain("Airdrop outcome agreement");
    expect(market).not.toContain("Solana");
    expect(market).not.toContain("manual OTC");
    expect(wallet).not.toContain("sendArcManualOtcUsdc");
    expect(wallet).toContain("TaskCreated");
  });

  it("uses bright backing surfaces for Arc's black logo in public Arc entry points", () => {
    const styles = read("client/src/index.css");
    const home = read("client/src/pages/Home.tsx");
    expect(styles).toContain(".arc-mark-tile");
    expect(styles).toContain("background: #fff");
    expect(home).toContain("home-built-on-arc");
    expect(home).toContain("Built on Arc");
  });
});
