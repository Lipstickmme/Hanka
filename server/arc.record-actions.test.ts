import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { agreementActions, bountyActions } from "../client/src/lib/arcRecordActions";
import { ARC_AGREEMENT_STATE, ARC_BOUNTY_STATE, ZERO_ADDRESS, type ArcAgreement, type ArcBounty } from "../client/src/lib/arcTestnet";

const REQUESTER = "0x1111111111111111111111111111111111111111" as Address;
const TAKER = "0x2222222222222222222222222222222222222222" as Address;
const STRANGER = "0x3333333333333333333333333333333333333333" as Address;

const NOW = Date.UTC(2026, 0, 10);
const seconds = (ms: number) => BigInt(Math.floor(ms / 1000));
const future = seconds(NOW + 86_400_000);
const past = seconds(NOW - 86_400_000);

// Every handler is supplied, so what the table returns is the availability
// decision itself and not an artefact of a missing callback.
const allBountyHandlers = {
  onAccept: () => {},
  onSubmit: () => {},
  onApprove: () => {},
  onDispute: () => {},
  onCancel: () => {},
  onExpire: () => {},
  onTimeoutAccepted: () => {},
  onTimeoutSubmitted: () => {},
  onReleaseBond: () => {},
};

const allAgreementHandlers = {
  onAccept: () => {},
  onDecline: () => {},
  onDispute: () => {},
  onCancel: () => {},
  onExpire: () => {},
  onTimeout: () => {},
};

function bounty(overrides: Partial<ArcBounty> = {}): ArcBounty {
  return {
    id: BigInt(1),
    requester: REQUESTER,
    taker: ZERO_ADDRESS,
    token: "0x3600000000000000000000000000000000000000" as Address,
    tokenDecimals: 6,
    tokenSymbol: "USDC",
    reward: BigInt(5_000_000),
    retentionBond: BigInt(0),
    acceptBy: future,
    dueAt: future,
    reviewBy: future,
    retentionEndsAt: BigInt(0),
    feeBpsSnapshot: 500,
    proofType: 0,
    kind: 0,
    state: ARC_BOUNTY_STATE.open,
    stateLabel: "Open",
    offerId: BigInt(0),
    termsHash: "0xaa" as never,
    metadataHash: "0xbb" as never,
    deliveryHash: "0xcc" as never,
    ...overrides,
  };
}

function agreement(overrides: Partial<ArcAgreement> = {}): ArcAgreement {
  return {
    id: BigInt(1),
    maker: REQUESTER,
    taker: TAKER,
    token: "0x3600000000000000000000000000000000000000" as Address,
    tokenDecimals: 6,
    tokenSymbol: "USDC",
    collateral: BigInt(50_000_000),
    acceptBy: future,
    settlementBy: future,
    feeBpsSnapshot: 500,
    makerDeclinePayoutBps: 5_000,
    makerTimeoutPayoutBps: 5_000,
    state: ARC_AGREEMENT_STATE.open,
    stateLabel: "Open",
    termsHash: "0xaa" as never,
    metadataHash: "0xbb" as never,
    ...overrides,
  };
}

const ids = (actions: Array<{ id: string }>) => actions.map(action => action.id).sort();

describe("bounty lifecycle actions", () => {
  it("offers an open bounty to a stranger but never to its own requester", () => {
    const record = bounty();
    expect(ids(bountyActions(record, STRANGER, allBountyHandlers, { now: NOW }))).toEqual(["accept"]);
    // acceptBounty() reverts with Unauthorized for the requester.
    expect(ids(bountyActions(record, REQUESTER, allBountyHandlers, { now: NOW }))).toEqual(["cancel"]);
  });

  it("offers nothing to accept while disconnected", () => {
    expect(ids(bountyActions(bounty(), null, allBountyHandlers, { now: NOW }))).toEqual([]);
  });

  it("replaces accept with the permissionless refund once the accept deadline passes", () => {
    const record = bounty({ acceptBy: past });
    expect(ids(bountyActions(record, STRANGER, allBountyHandlers, { now: NOW }))).toEqual(["expire"]);
    expect(ids(bountyActions(record, REQUESTER, allBountyHandlers, { now: NOW }))).toEqual(["cancel", "expire"]);
  });

  it("lets only the claimant submit, and only before the due date", () => {
    const accepted = bounty({ state: ARC_BOUNTY_STATE.accepted, taker: TAKER });
    expect(ids(bountyActions(accepted, TAKER, allBountyHandlers, { now: NOW }))).toEqual(["dispute", "submit"]);
    expect(ids(bountyActions(accepted, REQUESTER, allBountyHandlers, { now: NOW }))).toEqual(["dispute"]);
    expect(ids(bountyActions(accepted, STRANGER, allBountyHandlers, { now: NOW }))).toEqual([]);

    const overdue = bounty({ state: ARC_BOUNTY_STATE.accepted, taker: TAKER, dueAt: past });
    expect(ids(bountyActions(overdue, TAKER, allBountyHandlers, { now: NOW }))).toEqual(["dispute", "timeout-accepted"]);
  });

  it("lets only the requester release a submitted bounty until the review window lapses", () => {
    const submitted = bounty({ state: ARC_BOUNTY_STATE.submitted, taker: TAKER });
    expect(ids(bountyActions(submitted, REQUESTER, allBountyHandlers, { now: NOW }))).toEqual(["approve", "dispute"]);
    expect(ids(bountyActions(submitted, TAKER, allBountyHandlers, { now: NOW }))).toEqual(["dispute"]);

    // After reviewBy, timeoutSubmittedBounty() is callable by anyone.
    const lapsed = bounty({ state: ARC_BOUNTY_STATE.submitted, taker: TAKER, reviewBy: past });
    expect(ids(bountyActions(lapsed, STRANGER, allBountyHandlers, { now: NOW }))).toEqual(["timeout-submitted"]);
  });

  it("releases a retention bond only after the retention period ends", () => {
    const holding = bounty({ state: ARC_BOUNTY_STATE.retentionActive, taker: TAKER, retentionEndsAt: future });
    expect(ids(bountyActions(holding, TAKER, allBountyHandlers, { now: NOW }))).toEqual([]);

    const matured = bounty({ state: ARC_BOUNTY_STATE.retentionActive, taker: TAKER, retentionEndsAt: past });
    expect(ids(bountyActions(matured, TAKER, allBountyHandlers, { now: NOW }))).toEqual(["release-bond"]);
  });

  it("offers nothing on a finished record", () => {
    for (const state of [ARC_BOUNTY_STATE.paid, ARC_BOUNTY_STATE.settled, ARC_BOUNTY_STATE.cancelled, ARC_BOUNTY_STATE.expired]) {
      expect(ids(bountyActions(bounty({ state, taker: TAKER }), REQUESTER, allBountyHandlers, { now: NOW }))).toEqual([]);
    }
  });
});

describe("agreement lifecycle actions", () => {
  it("lets only the named counterparty match collateral", () => {
    const record = agreement();
    expect(ids(agreementActions(record, TAKER, allAgreementHandlers, { now: NOW }))).toEqual(["accept"]);
    expect(ids(agreementActions(record, REQUESTER, allAgreementHandlers, { now: NOW }))).toEqual(["cancel"]);
    expect(ids(agreementActions(record, STRANGER, allAgreementHandlers, { now: NOW }))).toEqual([]);
  });

  it("swaps acceptance for a refund once the accept deadline passes", () => {
    const record = agreement({ acceptBy: past });
    expect(ids(agreementActions(record, TAKER, allAgreementHandlers, { now: NOW }))).toEqual(["expire"]);
  });

  it("offers the maker's decline split only before settlement, and the timeout split only after", () => {
    const funded = agreement({ state: ARC_AGREEMENT_STATE.funded });
    expect(ids(agreementActions(funded, REQUESTER, allAgreementHandlers, { now: NOW }))).toEqual(["decline", "dispute"]);
    expect(ids(agreementActions(funded, TAKER, allAgreementHandlers, { now: NOW }))).toEqual(["dispute"]);

    const lapsed = agreement({ state: ARC_AGREEMENT_STATE.funded, settlementBy: past });
    expect(ids(agreementActions(lapsed, REQUESTER, allAgreementHandlers, { now: NOW }))).toEqual(["dispute", "timeout"]);
    expect(ids(agreementActions(lapsed, STRANGER, allAgreementHandlers, { now: NOW }))).toEqual(["timeout"]);
  });

  it("offers nothing on a finished agreement", () => {
    for (const state of [ARC_AGREEMENT_STATE.settled, ARC_AGREEMENT_STATE.cancelled, ARC_AGREEMENT_STATE.expired]) {
      expect(ids(agreementActions(agreement({ state }), REQUESTER, allAgreementHandlers, { now: NOW }))).toEqual([]);
    }
  });
});
