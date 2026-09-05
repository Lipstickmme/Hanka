import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// JSX and Prettier wrap long copy across lines, so prose assertions run
// against a whitespace-normalised copy of the source.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\s+/g, " ");
const source = read("client/src/components/BountySubmissionDialog.tsx");
const market = read("client/src/components/ArcMarketWorkspace.tsx");
const actions = read("client/src/lib/arcRecordActions.ts");

describe("HANKA bounty claimant submission", () => {
  it("offers the delivery modal only to the accepted claimant", () => {
    // submitBounty() reverts for anyone but the taker, and only in Accepted.
    expect(actions).toContain("if (record.state === ARC_BOUNTY_STATE.accepted)");
    expect(actions).toContain("if (isTaker && !dueExpired && handlers.onSubmit)");
    expect(market).toContain("<BountySubmissionDialog");
    expect(market).toContain("setSubmissionRecord(record)");
  });

  it("collects deliverable acknowledgements and evidence without falsely storing attachments onchain", () => {
    expect(source).toContain("Confirm deliverables");
    expect(source).toContain("Explain what you delivered.");
    expect(source).toContain("ADD LINK");
    expect(source).toContain("no file is uploaded");
    expect(source).toContain("does not upload files or publish your full evidence text onchain");
    expect(source).toContain("SUBMIT DELIVERY HASH");
  });

  it("commits an evidence summary only after every deliverable and the attestation are complete", () => {
    expect(source).toContain("const allComplete = deliverables.length === 0 || complete.every(Boolean)");
    expect(source).toContain("!allComplete || !description.trim() || !attested");
    expect(source).toContain("HANKA bounty delivery submission");
    expect(market).toContain("submitArcBounty(record.id, delivery)");
  });
});
