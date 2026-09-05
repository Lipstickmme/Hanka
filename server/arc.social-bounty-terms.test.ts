import { describe, expect, it } from "vitest";
import { buildArcSocialBountyTerms, normalizeArcHandle } from "../shared/arcBountyTerms";

describe("Arc social-Bounty terms", () => {
  it("normalizes the public target and makes social-proof obligations part of the committed terms", () => {
    const terms = buildArcSocialBountyTerms({
      title: "Earn a CommonsMade vouch",
      summary: "Create a clear, valid Ethos vouch for the named target.",
      deliverables: ["Publish one valid vouch", "Submit an evidence reference"],
      projectSlug: " CommonsMade ",
      instrument: "vouch",
      targetHandle: "@Target_Handle",
      proofDetail: "  Complete  a  vouch   from the named source. ",
      retentionDays: 30,
      featuredToken: "CM",
      location: "Global",
      verificationMethod: "manual_evidence_reference",
    });
    expect(normalizeArcHandle("@Target_Handle")).toBe("target_handle");
    expect(terms).toContain("Title: Earn a CommonsMade vouch");
    expect(terms).toContain("Summary: Create a clear, valid Ethos vouch for the named target.");
    expect(terms).toContain("Deliverables: 1. Publish one valid vouch | 2. Submit an evidence reference");
    expect(terms).toContain("Project: commonsmade");
    expect(terms).toContain("Proof: vouch");
    expect(terms).toContain("Target: @target_handle");
    expect(terms).toContain("Scope: Complete a vouch from the named source.");
    expect(terms).toContain("Retention: 30 days");
    expect(terms).toContain("Winners: 1 (current Arc Testnet contract limit)");
    expect(terms).toContain("Featured token: CM");
    expect(terms).toContain("Location: Global");
    expect(terms).toContain("Verification: manual_evidence_reference");
    expect(terms).toContain("Safety attestation:");
    expect(terms).toContain("Reward is held by the HANKA Arc Testnet contract");
  });
});
