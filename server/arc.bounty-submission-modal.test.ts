import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/components/BountySubmissionDialog.tsx"), "utf8");
const market = readFileSync(resolve(process.cwd(), "client/src/pages/ArcMarket.tsx"), "utf8");

describe("HANKA Bounty claimant submission", () => {
  it("requires an accepted Bounty worker before opening the delivery modal", () => {
    expect(market).toContain("getArcWalletDashboard(wallet)");
    expect(market).toContain("sameAddress(item.taker, wallet)");
    expect(market).toContain("item.state !== 2");
    expect(market).toContain("<BountySubmissionDialog");
  });

  it("collects deliverable acknowledgements and evidence without falsely storing attachments onchain", () => {
    expect(source).toContain("Confirm deliverables");
    expect(source).toContain("Explain what you delivered.");
    expect(source).toContain("ADD LINK");
    expect(source).toContain("no file is uploaded");
    expect(source).toContain("does not upload files or publish your full evidence text onchain");
    expect(source).toContain("SUBMIT DELIVERY HASH");
  });

  it("commits an evidence summary only after all deliverables and safety attestation are complete", () => {
    expect(source).toContain("const allComplete = deliverables.length > 0 && complete.every(Boolean)");
    expect(source).toContain("!allComplete || !description.trim() || !attested");
    expect(market).toContain("HANKA Arc Testnet Bounty delivery submission");
    expect(market).toContain("Local attachment previews:");
    expect(market).toContain("submitArcTask(submissionTask.id, terms)");
  });
});
