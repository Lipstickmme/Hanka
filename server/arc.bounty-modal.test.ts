import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// JSX and Prettier wrap long copy across lines, so prose assertions run
// against a whitespace-normalised copy of the source.
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8").replace(/\s+/g, " ");
const source = read("client/src/components/BountyCreateDialog.tsx");
const market = read("client/src/components/ArcMarketWorkspace.tsx");

describe("HANKA bounty creation modal", () => {
  it("keeps the form in a responsive dialog rather than the bounty board", () => {
    expect(source).toContain("<Dialog open={open}");
    // A tall form inside a centred fixed dialog is unreachable on a phone
    // without its own scroll container.
    expect(source).toContain("max-h-[88vh]");
    expect(source).toContain("overflow-y-auto");
    expect(market).toContain("setBountyDialogOpen(true)");
    expect(market).toContain("<BountyCreateDialog");
    expect(market).toContain("CREATE BOUNTY");
  });

  it("requires concrete details and clearly describes actual contract and storage limits", () => {
    expect(source).toContain("Bounty details");
    expect(source).toContain("Deliverables *");
    expect(source).toContain("const MAX_DELIVERABLE_LENGTH = 100;");
    expect(source).toContain("{MAX_DELIVERABLE_LENGTH} characters max each");
    expect(source).toContain("Multi-winner reward splits are not available");
    expect(source).toContain("Files are not uploaded to the");
    expect(source).toContain("does not request illegal, exploitative, prohibited");
  });

  it("explains the deadline ordering the contract enforces", () => {
    // _validateBountyCreate reverts unless acceptBy < dueAt < reviewBy.
    expect(source).toContain("accept, then due, then review");
    expect(source).toContain('toUnixSeconds(acceptBy, "Accept deadline")');
    expect(source).toContain('toUnixSeconds(dueAt, "Due date")');
    expect(source).toContain('toUnixSeconds(reviewBy, "Review deadline")');
  });

  it("will not submit until the brief is complete and attested", () => {
    expect(source).toContain("const ready =");
    expect(source).toContain("filledDeliverables.length > 0 && attested");
    expect(source).toContain("disabled={!ready || pending}");
  });
});
