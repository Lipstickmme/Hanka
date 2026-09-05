import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const market = read("client/src/pages/ArcMarket.tsx");
const bountyDialog = read("client/src/components/BountyCreateDialog.tsx");
const pointDialog = read("client/src/components/PointAgreementDialog.tsx");
const retentionDialog = read("client/src/components/SocialProofRetentionDialog.tsx");
const service = read("server/market/arcBounties.ts");

describe("HANKA unified market structure", () => {
  it("keeps Bounties, social proof, and airdrop agreements inside one shared dashboard", () => {
    expect(market).toContain('type Mode = "bounties" | "social" | "points"');
    expect(market).toContain(">BOUNTIES</Tab>");
    expect(market).toContain(">SOCIAL PROOF</Tab>");
    expect(market).toContain(">POINT EXCHANGE</Tab>");
  });

  it("uses dedicated modal forms instead of a mixed dashboard form", () => {
    expect(market).toContain("<BountyCreateDialog");
    expect(market).toContain("<SocialProofOfferDialog");
    expect(market).toContain("<PointAgreementDialog");
    expect(pointDialog).toContain("FUND AIRDROP AGREEMENT");
    expect(bountyDialog).toContain('isSocial ? "Buy social proof" : "Bounty details"');
    expect(bountyDialog).not.toContain("General Bounty</Choice>");
  });

  it("starts social retention only after payment and restricts confirmed early-removal sources", () => {
    expect(service).toContain("Retention begins only after this Bounty has paid onchain.");
    expect(service).toContain("Only the configured onchain resolver can review a social-proof retention report.");
    expect(service).toContain("This source is restricted from publishing HANKA social-proof offers.");
    expect(service).toContain("isActive: false");
    expect(retentionDialog).toContain("Report early removal");
    expect(retentionDialog).toContain("Reports do not reverse an onchain payout");
  });
});
