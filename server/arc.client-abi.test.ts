import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import { toFunctionSignature, type AbiFunction } from "viem";
import { describe, expect, it } from "vitest";
import { hankaMarketV2Abi } from "../client/src/lib/arcTestnet";

/**
 * The client ABI is the seam where the app meets the chain, and a mismatch is
 * silent: every read returns nothing and every write reverts, which is exactly
 * how the market broke before. The previous client called jobCount(), jobs(),
 * pointSaleCount(), pointSales(), listJob() and listPointSale() — none of which
 * this contract has ever declared — so the whole board read as an RPC outage.
 *
 * This compiles the contract and compares signatures, so the two can never
 * drift again without a red test.
 */

const source = readFileSync(resolve(process.cwd(), "contracts/src/HankaMarketV2.sol"), "utf8");

const compiled = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "HankaMarketV2.sol": { content: source } },
      settings: { viaIR: true, optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi"] } } },
    }),
  ),
) as { errors?: Array<{ severity: string; formattedMessage: string }>; contracts: Record<string, Record<string, { abi: AbiFunction[] }>> };

const compilerErrors = (compiled.errors ?? []).filter(item => item.severity === "error");
const contractAbi = compiled.contracts["HankaMarketV2.sol"].HankaMarketV2.abi;

const signatures = (abi: readonly unknown[]) =>
  (abi as AbiFunction[]).filter(item => item.type === "function").map(item => toFunctionSignature(item));

describe("HankaMarketV2 client ABI", () => {
  it("compiles the deployed contract source", () => {
    expect(compilerErrors).toEqual([]);
    expect(contractAbi.length).toBeGreaterThan(0);
  });

  it("declares only functions the contract actually exposes", () => {
    const onchain = new Set(signatures(contractAbi));
    const missing = signatures(hankaMarketV2Abi).filter(signature => !onchain.has(signature));
    expect(missing).toEqual([]);
  });

  it("covers the full lifecycle the market UI drives", () => {
    const declared = new Set((hankaMarketV2Abi as AbiFunction[]).filter(item => item.type === "function").map(item => item.name));
    for (const name of [
      "bountyCount",
      "agreementCount",
      "bounties",
      "agreements",
      "allowedToken",
      "defaultFeeBps",
      "paused",
      "roleHolder",
      "createBounty",
      "acceptBounty",
      "submitBounty",
      "approveBounty",
      "disputeBounty",
      "cancelUnacceptedBounty",
      "expireUnacceptedBounty",
      "timeoutAcceptedBounty",
      "timeoutSubmittedBounty",
      "releaseRetentionBond",
      "createAgreement",
      "acceptAgreement",
      "declineAgreement",
      "disputeAgreement",
      "cancelUnacceptedAgreement",
      "expireUnacceptedAgreement",
      "timeoutAgreement",
    ]) {
      expect(declared).toContain(name);
    }
  });

  it("keeps none of the functions the broken client invented", () => {
    const declared = new Set((hankaMarketV2Abi as AbiFunction[]).filter(item => item.type === "function").map(item => item.name));
    for (const removed of ["jobCount", "jobs", "listJob", "pointSaleCount", "pointSales", "listPointSale", "submitJob", "approveTask", "acceptTask"]) {
      expect(declared).not.toContain(removed);
    }
  });

  it("reads the bounty and agreement getters in the contract's declared field order", () => {
    const bountyGetter = contractAbi.find(item => item.type === "function" && item.name === "bounties");
    const agreementGetter = contractAbi.find(item => item.type === "function" && item.name === "agreements");
    // The struct accessors that the record mappers index positionally.
    expect(bountyGetter?.outputs.map(output => output.name)).toEqual([
      "requester", "taker", "token", "feeRecipient", "reward", "retentionBond", "acceptBy", "dueAt", "reviewBy",
      "retentionPeriod", "retentionEndsAt", "caseReviewPeriod", "caseResolveBy", "minimumFollowerCount",
      "minimumEthosScore", "minimumKaitoScore", "minimumKaitoAura", "feeBpsSnapshot", "proofType", "kind", "state",
      "caseDefaultToRequester", "requireVerifiedSource", "offerId", "termsHash", "metadataHash", "targetActionHash",
      "sourceIdentityHash", "deliveryHash", "evidenceHash",
    ]);
    expect(agreementGetter?.outputs.map(output => output.name)).toEqual([
      "maker", "taker", "token", "feeRecipient", "collateral", "acceptBy", "settlementBy", "feeBpsSnapshot",
      "makerDeclinePayoutBps", "makerTimeoutPayoutBps", "state", "termsHash", "metadataHash",
    ]);
  });
});
