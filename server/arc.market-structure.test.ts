import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const market = read("client/src/components/ArcMarketWorkspace.tsx");
const bountyDialog = read("client/src/components/BountyCreateDialog.tsx");
const agreementDialog = read("client/src/components/AgreementCreateDialog.tsx");
const styles = read("client/src/index.css");

describe("HANKA unified market structure", () => {
  it("keeps bounties, exchanges, and wallet activity inside one shared dashboard", () => {
    expect(market).toContain('type Mode = "bounties" | "points" | "activity"');
    expect(market).toContain('{ id: "bounties", label: "BOUNTIES" }');
    expect(market).toContain('{ id: "points", label: "POINT EXCHANGE" }');
    expect(market).toContain('{ id: "activity", label: "MY ACTIVITY" }');
  });

  it("uses dedicated modal forms instead of a mixed dashboard form", () => {
    expect(market).toContain("<BountyCreateDialog");
    expect(market).toContain("<AgreementCreateDialog");
    expect(market).toContain("<BountySubmissionDialog");
    expect(bountyDialog).toContain("<Dialog open={open}");
    expect(agreementDialog).toContain("FUND AGREEMENT");
    expect(bountyDialog).toContain("Bounty details");
  });

  it("defines the panel and field styles the market actually uses", () => {
    // These class names were used throughout the market but never defined, so
    // every card and input rendered as bare text on the page background.
    for (const className of [".hanka-panel", ".hanka-input", ".hanka-stat", ".hanka-record", ".hanka-tab", ".hanka-chip"]) {
      expect(styles).toMatch(new RegExp(`\\${className}[\\s,{]`));
    }
  });

  it("does not fake page copy through CSS pseudo-element content", () => {
    // Copy injected with `content:` is invisible to search, translation and
    // screen readers, and silently diverges from the JSX beneath it.
    expect(styles).not.toContain('content: "ARC · SOCIAL PROOF EXCHANGE"');
    expect(styles).not.toContain('content: "This board reads public Arc state');
    expect(market).toContain("ARC · SOCIAL PROOF EXCHANGE");
    expect(market).toContain("No sample bounties are invented.");
  });

  it("offers only tokens the deployed contract allowlists", () => {
    expect(market).toContain("getArcAllowedTokens");
    expect(read("client/src/lib/arcTestnet.ts")).toContain('functionName: "allowedToken"');
  });
});
