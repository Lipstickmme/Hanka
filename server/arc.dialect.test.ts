import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import solc from "solc";
import { toFunctionSelector, type AbiFunction } from "viem";
import { describe, expect, it } from "vitest";
import {
  ARC_AGREEMENT_STATE,
  ARC_BOUNTY_STATE,
  ARC_DIALECT_LABEL,
  ARC_UNKNOWN_FUNCTION_SELECTOR,
  arcCapabilities,
  hankaArcEscrowAbi,
  normalizeV1Exchange,
  normalizeV1Task,
  type TokenMeta,
} from "../client/src/lib/arcContracts";
import { arcActionSupported, isUnknownFunctionError } from "../client/src/lib/arcTestnet";
import { agreementActions, bountyActions } from "../client/src/lib/arcRecordActions";
import type { Address } from "viem";

/**
 * HANKA has shipped two escrow contracts, and both end with
 * `fallback() { revert NativeValueNotAccepted(); }`. Calling a function the
 * deployed contract does not implement therefore reverts with 0xa1d5007f rather
 * than failing as "no such function" — which is exactly how a v2 ABI pointed at
 * a v1 deployment presented itself: as an unexplained contract revert.
 */

const escrowSource = readFileSync(resolve(process.cwd(), "contracts/src/HankaArcEscrow.sol"), "utf8");
const compiled = JSON.parse(
  solc.compile(
    JSON.stringify({
      language: "Solidity",
      sources: { "HankaArcEscrow.sol": { content: escrowSource } },
      settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi"] } } },
    }),
  ),
) as { errors?: Array<{ severity: string }>; contracts: Record<string, Record<string, { abi: AbiFunction[] }>> };
const escrowAbi = compiled.contracts["HankaArcEscrow.sol"].HankaArcEscrow.abi;

const USDC = "0x3600000000000000000000000000000000000000" as Address;
const REQUESTER = "0x1111111111111111111111111111111111111111" as Address;
const TAKER = "0x2222222222222222222222222222222222222222" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;
const HASH = "0x1234567890123456789012345678901234567890123456789012345678901234" as `0x${string}`;
const tokens = new Map<string, TokenMeta>([[USDC.toLowerCase(), { decimals: 6, symbol: "USDC" }]]);

describe("unknown-function detection", () => {
  it("names the selector the catch-all fallback reverts with", () => {
    expect(toFunctionSelector("function NativeValueNotAccepted()")).toBe(ARC_UNKNOWN_FUNCTION_SELECTOR);
    // Both contracts route unmatched selectors there, so neither can report a
    // missing function any other way.
    for (const file of ["contracts/src/HankaMarketV2.sol", "contracts/src/HankaArcEscrow.sol"]) {
      expect(readFileSync(resolve(process.cwd(), file), "utf8")).toContain(
        "fallback() external payable { revert NativeValueNotAccepted(); }",
      );
    }
  });

  it("recognises that revert so the dialect probe can move on instead of failing", () => {
    expect(isUnknownFunctionError({ message: `reverted with the following signature: ${ARC_UNKNOWN_FUNCTION_SELECTOR}` })).toBe(true);
    expect(isUnknownFunctionError({ message: "reverted with custom error NativeValueNotAccepted()" })).toBe(true);
    expect(isUnknownFunctionError({ message: 'The contract function "bountyCount" returned no data ("0x")' })).toBe(true);
    // A genuine failure must not be mistaken for a missing function.
    expect(isUnknownFunctionError({ message: "HTTP request failed. Details: Failed to fetch" })).toBe(false);
    expect(isUnknownFunctionError({ message: "reverted with custom error InvalidState()" })).toBe(false);
  });
});

describe("HankaArcEscrow client ABI", () => {
  it("declares only functions the compiled v1 contract exposes", () => {
    const onchain = new Set(
      (escrowAbi as AbiFunction[]).filter(item => item.type === "function").map(item => toFunctionSelector(item)),
    );
    const missing = (hankaArcEscrowAbi as AbiFunction[])
      .filter(item => item.type === "function")
      .map(item => ({ name: item.name, selector: toFunctionSelector(item) }))
      .filter(item => !onchain.has(item.selector));
    expect(missing).toEqual([]);
  });

  it("does not declare bountyCount, which is what proved the deployment is not v2", () => {
    const names = new Set((hankaArcEscrowAbi as AbiFunction[]).filter(item => item.type === "function").map(item => item.name));
    expect(names).not.toContain("bountyCount");
    expect(names).toContain("taskCount");
    expect(names).toContain("pointExchangeCount");
  });
});

describe("v1 record normalisation", () => {
  const task = (state: number) =>
    normalizeV1Task(
      BigInt(7),
      [REQUESTER, TAKER, USDC, BigInt(25_000_000), BigInt(1_760_000_000), BigInt(1_770_000_000), HASH, HASH, state],
      tokens,
      500,
    );

  it("maps a v1 task onto the shared bounty shape", () => {
    const record = task(2);
    expect(record.requester).toBe(REQUESTER);
    expect(record.reward).toBe(BigInt(25_000_000));
    expect(record.tokenSymbol).toBe("USDC");
    expect(record.feeBpsSnapshot).toBe(500);
    // v1 has no review window, no bond and no metadata commitment.
    expect(record.reviewBy).toBe(BigInt(0));
    expect(record.retentionBond).toBe(BigInt(0));
  });

  it("translates v1 state indices into the canonical space, keeping the contract's own label", () => {
    // v1 TaskState: None, Open, Accepted, Submitted, Disputed, Paid, Cancelled.
    expect(task(1).state).toBe(ARC_BOUNTY_STATE.open);
    expect(task(3).state).toBe(ARC_BOUNTY_STATE.submitted);
    // Index 4 is Disputed in v1 but Paid in v2 — the remap is what stops a
    // disputed record rendering as paid.
    expect(task(4).state).toBe(ARC_BOUNTY_STATE.disputed);
    expect(task(4).stateLabel).toBe("Disputed");
    expect(task(5).state).toBe(ARC_BOUNTY_STATE.paid);
    expect(task(5).stateLabel).toBe("Paid");
    expect(task(6).state).toBe(ARC_BOUNTY_STATE.cancelled);
  });

  it("maps a v1 point exchange onto the shared agreement shape", () => {
    const exchange = (state: number) =>
      normalizeV1Exchange(
        BigInt(3),
        [REQUESTER, TAKER, USDC, BigInt(50_000_000), BigInt(1_760_000_000), BigInt(1_770_000_000), HASH, HASH, HASH, state],
        tokens,
        500,
      );
    expect(exchange(1).state).toBe(ARC_AGREEMENT_STATE.open);
    expect(exchange(2).state).toBe(ARC_AGREEMENT_STATE.funded);
    // v1 "Declined" settles the exchange; v2 has no separate state for it, so
    // the canonical state is Settled while the label stays truthful.
    expect(exchange(5).state).toBe(ARC_AGREEMENT_STATE.settled);
    expect(exchange(5).stateLabel).toBe("Declined");
    expect(exchange(6).state).toBe(ARC_AGREEMENT_STATE.cancelled);
    expect(exchange(1).makerDeclinePayoutBps).toBe(0);
  });
});

describe("capability gating", () => {
  const v1 = arcCapabilities("v1");
  const v2 = arcCapabilities("v2");
  const NOW = Date.UTC(2026, 0, 10);
  const past = BigInt(Math.floor((NOW - 86_400_000) / 1000));

  const expired = normalizeV1Task(
    BigInt(1),
    [REQUESTER, ZERO, USDC, BigInt(5_000_000), past, past, HASH, HASH, 1],
    tokens,
    500,
  );

  it("hides v2-only exits on a v1 deployment", () => {
    const handlers = { onExpire: () => {}, onCancel: () => {} };
    expect(bountyActions(expired, TAKER, handlers, { capabilities: v2, now: NOW }).map(a => a.id)).toEqual(["expire"]);
    // cancelUnacceptedTask exists on v1; expireUnacceptedBounty does not.
    expect(bountyActions(expired, TAKER, handlers, { capabilities: v1, now: NOW })).toEqual([]);
    expect(bountyActions(expired, REQUESTER, handlers, { capabilities: v1, now: NOW }).map(a => a.id)).toEqual(["cancel"]);
  });

  it("hides the timeout settlement on a v1 exchange", () => {
    const lapsed = normalizeV1Exchange(
      BigInt(1),
      [REQUESTER, TAKER, USDC, BigInt(50_000_000), past, past, HASH, HASH, HASH, 2],
      tokens,
      500,
    );
    const handlers = { onTimeout: () => {}, onDispute: () => {} };
    expect(agreementActions(lapsed, REQUESTER, handlers, { capabilities: v2, now: NOW }).map(a => a.id).sort()).toEqual(["dispute", "timeout"]);
    expect(agreementActions(lapsed, REQUESTER, handlers, { capabilities: v1, now: NOW }).map(a => a.id)).toEqual(["dispute"]);
  });

  it("does not quote a fixed split that a v1 contract never agreed", () => {
    const funded = normalizeV1Exchange(
      BigInt(1),
      [REQUESTER, TAKER, USDC, BigInt(50_000_000), BigInt(Math.floor(NOW / 1000) + 86_400), BigInt(Math.floor(NOW / 1000) + 172_800), HASH, HASH, HASH, 2],
      tokens,
      500,
    );
    const [decline] = agreementActions(funded, REQUESTER, { onDecline: () => {} }, { capabilities: v1, now: NOW });
    expect(decline.hint).not.toContain("0%");
    expect(decline.hint).toContain("this contract's decline terms");
  });
});

describe("action dispatch", () => {
  it("maps shared actions onto each contract's own function names", () => {
    for (const action of ["acceptBounty", "submitBounty", "approveBounty", "disputeBounty", "cancelBounty"] as const) {
      expect(arcActionSupported(action, "v1")).toBe(true);
      expect(arcActionSupported(action, "v2")).toBe(true);
    }
    // v1 has no timeout exits, no expiry and no retention bond.
    for (const action of ["expireBounty", "timeoutAcceptedBounty", "timeoutSubmittedBounty", "releaseRetentionBond", "timeoutAgreement"] as const) {
      expect(arcActionSupported(action, "v1")).toBe(false);
      expect(arcActionSupported(action, "v2")).toBe(true);
    }
  });

  it("labels each dialect by its contract name", () => {
    expect(ARC_DIALECT_LABEL.v1).toBe("HankaArcEscrow");
    expect(ARC_DIALECT_LABEL.v2).toBe("HankaMarketV2");
  });
});
