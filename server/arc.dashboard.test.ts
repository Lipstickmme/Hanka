import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const clientSource = read("client/src/lib/arcTestnet.ts");
const contractSource = read("client/src/lib/arcContracts.ts");
const workspace = read("client/src/components/ArcMarketWorkspace.tsx");
const dashboardPage = read("client/src/pages/ArcDashboard.tsx");
const marketPage = read("client/src/pages/ArcMarket.tsx");

describe("Arc wallet dashboard discovery", () => {
  it("uses bounded, read-only onchain discovery and filters records to the connected wallet", () => {
    expect(clientSource).toContain("MAX_SCANNED_RECORDS");
    expect(clientSource).toContain("Math.min(Number(count), MAX_SCANNED_RECORDS)");
    // A 300-call burst gets a public endpoint to rate-limit the browser, which
    // reads to the user as an outage.
    expect(clientSource).toContain("mapWithConcurrency");
    expect(clientSource).toContain("sameAddress(record.requester, wallet) || sameAddress(record.taker, wallet)");
    expect(clientSource).toContain("sameAddress(record.maker, wallet) || sameAddress(record.taker, wallet)");
  });

  it("maps each contract's own state enums rather than inventing labels", () => {
    expect(contractSource).toContain(
      '["None", "Open", "Accepted", "Submitted", "Paid", "RetentionActive", "RetentionCase", "Disputed", "Settled", "Cancelled", "Expired"]',
    );
    expect(contractSource).toContain('["None", "Open", "Funded", "Disputed", "Settled", "Cancelled", "Expired"]');
    expect(contractSource).toContain('["None", "Open", "Accepted", "Submitted", "Disputed", "Paid", "Cancelled"]');
    expect(contractSource).toContain('["None", "Open", "Funded", "Disputed", "Settled", "Declined", "Cancelled"]');
  });

  it("exposes a real-only public bounty scan without seeded marketplace records", () => {
    expect(clientSource).toContain("getArcOpenBounties");
    expect(clientSource).toContain("record.state === ARC_BOUNTY_STATE.open");
    expect(clientSource).toContain("never invent a description for it");
  });

  it("renders separate wallet-owned active and completed bounty and exchange ledgers", () => {
    expect(workspace).toContain("Only records where your connected EVM wallet");
    expect(workspace).toContain("Active bounties");
    expect(workspace).toContain("Completed bounties");
    expect(workspace).toContain("Active exchanges");
    expect(workspace).toContain("Completed exchanges");
  });

  it("serves the dashboard and the market board from one workspace so they cannot diverge", () => {
    expect(dashboardPage).toContain("<ArcMarketWorkspace");
    expect(dashboardPage).toContain('initialMode="activity"');
    expect(marketPage).toContain("<ArcMarketWorkspace");
    expect(marketPage).toContain('initialMode="bounties"');
  });

  it("reports protocol health beside the ledgers instead of leaving a silent empty board", () => {
    expect(workspace).toContain("Value in escrow");
    expect(workspace).toContain("Open bounties");
    expect(workspace).toContain("Live agreements");
    expect(workspace).toContain("Settled records");
    expect(workspace).toContain("Could not read Arc Testnet.");
    expect(workspace).toContain("Try again");
    expect(workspace).toContain("The market contract is paused.");
  });
});
