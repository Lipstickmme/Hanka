import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const market = readFileSync(resolve(process.cwd(), "client/src/pages/ArcMarket.tsx"), "utf8");
const offerDialog = readFileSync(resolve(process.cwd(), "client/src/components/SocialProofOfferDialog.tsx"), "utf8");
const bountyDialog = readFileSync(resolve(process.cwd(), "client/src/components/BountyCreateDialog.tsx"), "utf8");
const wallet = readFileSync(resolve(process.cwd(), "client/src/components/ArcWalletConnect.tsx"), "utf8");
const terms = readFileSync(resolve(process.cwd(), "shared/arcBountyTerms.ts"), "utf8");

describe("Arc social-proof desk", () => {
  it("keeps buyer requirements and seller offers distinct from general Bounties", () => {
    expect(market).toContain("SOCIAL PROOF");
    expect(market).toContain("BUY SOCIAL PROOF");
    expect(market).toContain("SELL SOCIAL PROOF");
    expect(offerDialog).toContain("Publish the social action and source-account metrics");
    expect(offerDialog).toContain("PUBLISH SOCIAL OFFER");
  });

  it("uses neutral seller scope and transparent self-declared source metrics", () => {
    expect(offerDialog).toContain("Project, creator, brand, or individual");
    expect(offerDialog).toContain("X followers");
    expect(offerDialog).toContain("Kaito Aura");
    expect(offerDialog).toContain("HANKA has not independently verified this claim");
    expect(bountyDialog).toContain("Project, creator, brand, or individual");
    expect(bountyDialog).not.toContain("placeholder=\"commonsmade\"");
  });

  it("commits buyer minimums but does not falsely claim the contract reads social data", () => {
    expect(bountyDialog).toContain("Minimum source requirements");
    expect(bountyDialog).toContain("generic escrow contract does not read social-platform data");
    expect(terms).toContain("Minimum followers:");
    expect(terms).toContain("Source verification required:");
  });

  it("frames a point exchange as an uncertain airdrop outcome agreement", () => {
    expect(market).toContain("Airdrop outcome agreement");
    expect(market).toContain("Price the uncertainty.");
    expect(market).toContain("not an oracle or promise of future airdrop value");
  });

  it("keeps the wallet control focused on the Arc mark rather than a generic wallet icon", () => {
    expect(wallet).toContain("arc-wallet-mark");
    expect(wallet).not.toContain("WalletCards");
  });
});
