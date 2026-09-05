import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "contracts/src/HankaMarketV2.sol"), "utf8");

describe("HANKA Market V2 contract design", () => {
  it("snapshots per-record fee terms and separates delayed operational roles", () => {
    expect(source).toContain("uint16 feeBpsSnapshot");
    expect(source).toContain("address feeRecipient");
    expect(source).toContain("enum Role { Admin, Arbiter, Pauser, SourceAttester, Treasury }");
    expect(source).toContain("uint64 public constant ROLE_CHANGE_DELAY = 48 hours");
    expect(source).toContain("_fee(bounty.reward, bounty.feeBpsSnapshot)");
    expect(source).toContain("_fee(uint256(agreement.collateral) * 2, agreement.feeBpsSnapshot)");
  });

  it("requires an attested social source, rejects duplicate source actions, and keeps a seller retention bond", () => {
    expect(source).toContain("function createSocialOffer(");
    expect(source).toContain("function acceptSocialBounty(");
    expect(source).toContain("function _validateSourceAttestation(");
    expect(source).toContain("SourceRequirementsNotMet");
    expect(source).toContain("usedSourceAction[sourceActionKey] = true");
    expect(source).toContain("_pull(bounty.token, msg.sender, bounty.retentionBond)");
    expect(source).toContain("function openRetentionCase(");
    expect(source).toContain("function releaseRetentionBond(");
    expect(source).toContain("restrictedSourceIdentity[bounty.sourceIdentityHash] = true");
  });

  it("uses bounded deadline exits and typed bilateral settlement signatures", () => {
    expect(source).toContain("function expireUnacceptedBounty(");
    expect(source).toContain("function timeoutAcceptedBounty(");
    expect(source).toContain("function timeoutSubmittedBounty(");
    expect(source).toContain("function timeoutAgreement(");
    expect(source).toContain("function settleAgreementWithSignatures(");
    expect(source).toContain("EIP712_DOMAIN_TYPEHASH");
    expect(source).toContain("usedSettlementAuthorizations[digest] = true");
  });

  it("keeps offchain platform facts outside the contract and rejects native-token custody", () => {
    expect(source).toContain("It does not read X, Ethos, Kaito, Aura, or airdrop data.");
    expect(source).toContain("receive() external payable { revert NativeValueNotAccepted(); }");
    expect(source).toContain("function _callOptionalReturn(");
    expect(source).toContain("modifier nonReentrant()");
  });
});
