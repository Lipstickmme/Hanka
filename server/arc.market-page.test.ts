import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(path.resolve(process.cwd(), "client/src/pages/ArcMarket.tsx"), "utf8");

describe("Arc market page", () => {
  it("keeps real transaction controls deployment-gated", () => {
    expect(page).toContain("getArcEscrowAddress");
    expect(page).toContain("Fund proof. Settle onchain.");
  });

  it("presents point exchanges and Bounty reward funding from the user Arc wallet", () => {
    expect(page).toContain("Airdrop outcome agreement");
    expect(page).toContain("CREATE BOUNTY");
    expect(page).toContain("<BountyCreateDialog");
    expect(page).toContain("createArcPointExchange");
    expect(page).toContain("createArcTask");
    expect(page).toContain("Price the uncertainty.");
  });

  it("renders only real open Bounties read from the public contract", () => {
    expect(page).toContain("getArcOpenBounties");
    expect(page).toContain("No sample Bounties are invented.");
    expect(page).toContain("No matching funded Bounties.");
  });

  it("includes onchain post-funding actions while keeping the contract as the settlement source of truth", () => {
    expect(page).toContain("CONFIRM & ACCEPT");
    expect(page).toContain("SUBMIT DELIVERY");
    expect(page).toContain("RELEASE REWARD");
    expect(page).toContain("DISPUTE");
    expect(page).toContain("configured onchain resolver");
  });
});
