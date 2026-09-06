import { parseAbi, type Address, type Hex } from "viem";

/**
 * HANKA has two escrow contracts in this repository, and which one a given
 * address holds is not knowable from the address alone.
 *
 * - `HankaArcEscrow` ("v1") settles tasks and point exchanges.
 * - `HankaMarketV2` ("v2") settles bounties, social bounties and agreements.
 *
 * Both end with `fallback() external payable { revert NativeValueNotAccepted(); }`,
 * so calling a function the deployed contract does not implement does not fail
 * with "no such function" — it reverts with 0xa1d5007f. That is exactly how the
 * market failed after being pointed at a v1 deployment with a v2 ABI, and it is
 * why the dialect is probed at runtime rather than assumed.
 *
 * Both dialects are normalised into one record shape so the UI, the lifecycle
 * action table, and the dashboard never have to branch on which is deployed.
 */

export type ArcDialect = "v1" | "v2";

/** Selector of `NativeValueNotAccepted()`, the catch-all fallback revert. */
export const ARC_UNKNOWN_FUNCTION_SELECTOR = "0xa1d5007f";

export const hankaMarketV2Abi = parseAbi([
  "function bountyCount() view returns (uint256)",
  "function agreementCount() view returns (uint256)",
  "function socialOfferCount() view returns (uint256)",
  "function bounties(uint256) view returns (address requester, address taker, address token, address feeRecipient, uint128 reward, uint128 retentionBond, uint64 acceptBy, uint64 dueAt, uint64 reviewBy, uint64 retentionPeriod, uint64 retentionEndsAt, uint64 caseReviewPeriod, uint64 caseResolveBy, uint64 minimumFollowerCount, uint64 minimumEthosScore, uint64 minimumKaitoScore, uint64 minimumKaitoAura, uint16 feeBpsSnapshot, uint8 proofType, uint8 kind, uint8 state, bool caseDefaultToRequester, bool requireVerifiedSource, uint256 offerId, bytes32 termsHash, bytes32 metadataHash, bytes32 targetActionHash, bytes32 sourceIdentityHash, bytes32 deliveryHash, bytes32 evidenceHash)",
  "function agreements(uint256) view returns (address maker, address taker, address token, address feeRecipient, uint128 collateral, uint64 acceptBy, uint64 settlementBy, uint16 feeBpsSnapshot, uint16 makerDeclinePayoutBps, uint16 makerTimeoutPayoutBps, uint8 state, bytes32 termsHash, bytes32 metadataHash)",
  "function socialOffers(uint256) view returns (address seller, bytes32 sourceIdentityHash, bytes32 metadataHash, uint32 capacity, uint32 reserved, uint64 expiresAt, uint8 proofType, bool isActive)",
  "function allowedToken(address) view returns (bool)",
  "function defaultFeeBps() view returns (uint16)",
  "function paused() view returns (bool)",
  "function roleHolder(uint8) view returns (address)",
  "function createBounty(address token, uint128 reward, uint64 acceptBy, uint64 dueAt, uint64 reviewBy, bytes32 termsHash, bytes32 metadataHash) returns (uint256 id)",
  "function acceptBounty(uint256 id)",
  "function submitBounty(uint256 id, bytes32 deliveryHash)",
  "function approveBounty(uint256 id)",
  "function disputeBounty(uint256 id)",
  "function cancelUnacceptedBounty(uint256 id)",
  "function expireUnacceptedBounty(uint256 id)",
  "function timeoutAcceptedBounty(uint256 id)",
  "function timeoutSubmittedBounty(uint256 id)",
  "function openRetentionCase(uint256 id, bytes32 evidenceHash)",
  "function releaseRetentionBond(uint256 id)",
  "function createAgreement(address token, address taker, uint128 collateral, uint64 acceptBy, uint64 settlementBy, uint16 makerDeclinePayoutBps, uint16 makerTimeoutPayoutBps, bytes32 termsHash, bytes32 metadataHash) returns (uint256 id)",
  "function acceptAgreement(uint256 id)",
  "function declineAgreement(uint256 id)",
  "function disputeAgreement(uint256 id)",
  "function cancelUnacceptedAgreement(uint256 id)",
  "function expireUnacceptedAgreement(uint256 id)",
  "function timeoutAgreement(uint256 id)",
  "event BountyCreated(uint256 indexed id, uint8 indexed kind, address indexed requester, address token, uint256 reward, uint256 retentionBond, uint64 acceptBy, uint64 dueAt, uint64 reviewBy, bytes32 termsHash, bytes32 metadataHash, bytes32 targetActionHash, uint256 offerId, uint16 feeBpsSnapshot, address feeRecipient)",
  "event AgreementCreated(uint256 indexed id, address indexed maker, address indexed taker, address token, uint256 collateral, uint64 acceptBy, uint64 settlementBy, uint16 makerDeclinePayoutBps, uint16 makerTimeoutPayoutBps, bytes32 termsHash, bytes32 metadataHash, uint16 feeBpsSnapshot, address feeRecipient)",
]);

export const hankaArcEscrowAbi = parseAbi([
  "function taskCount() view returns (uint256)",
  "function pointExchangeCount() view returns (uint256)",
  "function tasks(uint256) view returns (address requester, address taker, address token, uint128 reward, uint64 acceptDeadline, uint64 dueAt, bytes32 termsHash, bytes32 deliveryHash, uint8 state)",
  "function pointExchanges(uint256) view returns (address maker, address taker, address token, uint128 collateral, uint64 acceptDeadline, uint64 settlementDeadline, bytes32 termsHash, bytes32 makerApprovalHash, bytes32 takerApprovalHash, uint8 state)",
  "function allowedToken(address) view returns (bool)",
  "function feeBps() view returns (uint16)",
  "function resolver() view returns (address)",
  "function owner() view returns (address)",
  "function createTask(address token, uint128 reward, uint64 acceptDeadline, uint64 dueAt, bytes32 termsHash) returns (uint256 id)",
  "function acceptTask(uint256 id)",
  "function submitTask(uint256 id, bytes32 deliveryHash)",
  "function approveTask(uint256 id)",
  "function disputeTask(uint256 id)",
  "function cancelUnacceptedTask(uint256 id)",
  "function createPointExchange(address token, address taker, uint128 collateral, uint64 acceptDeadline, uint64 settlementDeadline, bytes32 termsHash) returns (uint256 id)",
  "function acceptPointExchange(uint256 id)",
  "function declinePointExchange(uint256 id)",
  "function disputePointExchange(uint256 id)",
  "function cancelUnacceptedPointExchange(uint256 id)",
  "event TaskCreated(uint256 indexed id, address indexed requester, address token, uint256 reward, uint64 acceptDeadline, uint64 dueAt, bytes32 termsHash)",
  "event PointExchangeCreated(uint256 indexed id, address indexed maker, address indexed taker, address token, uint256 collateral, uint64 acceptDeadline, uint64 settlementDeadline, bytes32 termsHash)",
]);

// ---------------------------------------------------------------------------
// State spaces
// ---------------------------------------------------------------------------

/** HankaMarketV2 BountyState, and the canonical space both dialects map into. */
export const ARC_BOUNTY_STATES = ["None", "Open", "Accepted", "Submitted", "Paid", "RetentionActive", "RetentionCase", "Disputed", "Settled", "Cancelled", "Expired"] as const;
/** HankaMarketV2 AgreementState, and the canonical space for exchanges. */
export const ARC_AGREEMENT_STATES = ["None", "Open", "Funded", "Disputed", "Settled", "Cancelled", "Expired"] as const;
export const ARC_SOCIAL_PROOF_TYPES = ["Vouch", "Slash", "Follow", "Repost", "Comment", "SpaceListener", "SpaceSpeaker", "SpaceContributor", "HankaPoints"] as const;

/** HankaArcEscrow TaskState, by index. */
export const ARC_V1_TASK_STATES = ["None", "Open", "Accepted", "Submitted", "Disputed", "Paid", "Cancelled"] as const;
/** HankaArcEscrow PointExchangeState, by index. */
export const ARC_V1_POINT_EXCHANGE_STATES = ["None", "Open", "Funded", "Disputed", "Settled", "Declined", "Cancelled"] as const;

export const ARC_BOUNTY_STATE = { none: 0, open: 1, accepted: 2, submitted: 3, paid: 4, retentionActive: 5, retentionCase: 6, disputed: 7, settled: 8, cancelled: 9, expired: 10 } as const;
export const ARC_AGREEMENT_STATE = { none: 0, open: 1, funded: 2, disputed: 3, settled: 4, cancelled: 5, expired: 6 } as const;

/** v1 TaskState index -> canonical bounty state index. */
const V1_TASK_STATE_TO_CANONICAL: Record<number, number> = {
  0: ARC_BOUNTY_STATE.none,
  1: ARC_BOUNTY_STATE.open,
  2: ARC_BOUNTY_STATE.accepted,
  3: ARC_BOUNTY_STATE.submitted,
  4: ARC_BOUNTY_STATE.disputed,
  5: ARC_BOUNTY_STATE.paid,
  6: ARC_BOUNTY_STATE.cancelled,
};

/** v1 PointExchangeState index -> canonical agreement state index. */
const V1_EXCHANGE_STATE_TO_CANONICAL: Record<number, number> = {
  0: ARC_AGREEMENT_STATE.none,
  1: ARC_AGREEMENT_STATE.open,
  2: ARC_AGREEMENT_STATE.funded,
  3: ARC_AGREEMENT_STATE.disputed,
  4: ARC_AGREEMENT_STATE.settled,
  // v1 "Declined" is a settlement at the declining party's split; v2 folds the
  // same outcome into Settled. The record keeps its own label for display.
  5: ARC_AGREEMENT_STATE.settled,
  6: ARC_AGREEMENT_STATE.cancelled,
};

export const arcBountyStateLabel = (state: number) => ARC_BOUNTY_STATES[state] ?? `State ${state}`;
export const arcAgreementStateLabel = (state: number) => ARC_AGREEMENT_STATES[state] ?? `State ${state}`;
export const arcProofTypeLabel = (proofType: number) => ARC_SOCIAL_PROOF_TYPES[proofType] ?? `Type ${proofType}`;

// ---------------------------------------------------------------------------
// Capabilities
// ---------------------------------------------------------------------------

/**
 * What each deployed contract can actually do. The lifecycle action table is
 * filtered through this so the UI never offers a button that would call a
 * function the deployed contract does not have — which, thanks to the catch-all
 * fallback, would revert with a misleading NativeValueNotAccepted().
 */
export type ArcCapability =
  | "bountyReviewWindow"
  | "bountyExpire"
  | "bountyTimeoutAccepted"
  | "bountyTimeoutSubmitted"
  | "retentionBond"
  | "agreementExpire"
  | "agreementTimeout"
  | "agreementPayoutSplits"
  | "metadataCommitment"
  | "pausable"
  | "socialBounties";

const V2_CAPABILITIES: ArcCapability[] = [
  "bountyReviewWindow",
  "bountyExpire",
  "bountyTimeoutAccepted",
  "bountyTimeoutSubmitted",
  "retentionBond",
  "agreementExpire",
  "agreementTimeout",
  "agreementPayoutSplits",
  "metadataCommitment",
  "pausable",
  "socialBounties",
];

/** v1 has no review window, no timeout exits, no bonds and no metadata hash. */
const V1_CAPABILITIES: ArcCapability[] = [];

export const arcCapabilities = (dialect: ArcDialect): ReadonlySet<ArcCapability> =>
  new Set(dialect === "v2" ? V2_CAPABILITIES : V1_CAPABILITIES);

export const ARC_DIALECT_LABEL: Record<ArcDialect, string> = {
  v1: "HankaArcEscrow",
  v2: "HankaMarketV2",
};

// ---------------------------------------------------------------------------
// Normalised records
// ---------------------------------------------------------------------------

export type ArcBounty = {
  id: bigint;
  requester: Address;
  taker: Address;
  token: Address;
  tokenDecimals: number;
  tokenSymbol: string;
  reward: bigint;
  retentionBond: bigint;
  acceptBy: bigint;
  dueAt: bigint;
  /** Zero on v1, which has no post-submission review window. */
  reviewBy: bigint;
  retentionEndsAt: bigint;
  feeBpsSnapshot: number;
  proofType: number;
  kind: number;
  /** Canonical state index, comparable across dialects. */
  state: number;
  /** The deployed contract's own name for that state. */
  stateLabel: string;
  offerId: bigint;
  termsHash: Hex;
  metadataHash: Hex;
  deliveryHash: Hex;
};

export type ArcAgreement = {
  id: bigint;
  maker: Address;
  taker: Address;
  token: Address;
  tokenDecimals: number;
  tokenSymbol: string;
  collateral: bigint;
  acceptBy: bigint;
  settlementBy: bigint;
  feeBpsSnapshot: number;
  /** Zero on v1, whose settlement is an explicit payout rather than a split. */
  makerDeclinePayoutBps: number;
  makerTimeoutPayoutBps: number;
  state: number;
  stateLabel: string;
  termsHash: Hex;
  metadataHash: Hex;
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
export const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export type TokenMeta = { decimals: number; symbol: string };

const tokenMeta = (tokens: Map<string, TokenMeta>, token: Address) => ({
  tokenDecimals: tokens.get(token.toLowerCase())?.decimals ?? 6,
  tokenSymbol: tokens.get(token.toLowerCase())?.symbol ?? "TOKEN",
});

export type V2BountyTuple = readonly [
  Address, Address, Address, Address, bigint, bigint, bigint, bigint, bigint, bigint,
  bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, number, number,
  number, boolean, boolean, bigint, Hex, Hex, Hex, Hex, Hex, Hex,
];
export type V2AgreementTuple = readonly [Address, Address, Address, Address, bigint, bigint, bigint, number, number, number, number, Hex, Hex];
export type V1TaskTuple = readonly [Address, Address, Address, bigint, bigint, bigint, Hex, Hex, number];
export type V1ExchangeTuple = readonly [Address, Address, Address, bigint, bigint, bigint, Hex, Hex, Hex, number];

export const normalizeV2Bounty = (id: bigint, value: V2BountyTuple, tokens: Map<string, TokenMeta>): ArcBounty => ({
  id,
  requester: value[0],
  taker: value[1],
  token: value[2],
  ...tokenMeta(tokens, value[2]),
  reward: value[4],
  retentionBond: value[5],
  acceptBy: value[6],
  dueAt: value[7],
  reviewBy: value[8],
  retentionEndsAt: value[10],
  feeBpsSnapshot: Number(value[17]),
  proofType: Number(value[18]),
  kind: Number(value[19]),
  state: Number(value[20]),
  stateLabel: arcBountyStateLabel(Number(value[20])),
  offerId: value[23],
  termsHash: value[24],
  metadataHash: value[25],
  deliveryHash: value[28],
});

export const normalizeV2Agreement = (id: bigint, value: V2AgreementTuple, tokens: Map<string, TokenMeta>): ArcAgreement => ({
  id,
  maker: value[0],
  taker: value[1],
  token: value[2],
  ...tokenMeta(tokens, value[2]),
  collateral: value[4],
  acceptBy: value[5],
  settlementBy: value[6],
  feeBpsSnapshot: Number(value[7]),
  makerDeclinePayoutBps: Number(value[8]),
  makerTimeoutPayoutBps: Number(value[9]),
  state: Number(value[10]),
  stateLabel: arcAgreementStateLabel(Number(value[10])),
  termsHash: value[11],
  metadataHash: value[12],
});

/** v1 carries one contract-wide fee rather than a per-record snapshot. */
export const normalizeV1Task = (id: bigint, value: V1TaskTuple, tokens: Map<string, TokenMeta>, feeBps: number): ArcBounty => {
  const raw = Number(value[8]);
  return {
    id,
    requester: value[0],
    taker: value[1],
    token: value[2],
    ...tokenMeta(tokens, value[2]),
    reward: value[3],
    retentionBond: BigInt(0),
    acceptBy: value[4],
    dueAt: value[5],
    reviewBy: BigInt(0),
    retentionEndsAt: BigInt(0),
    feeBpsSnapshot: feeBps,
    proofType: 0,
    kind: 0,
    state: V1_TASK_STATE_TO_CANONICAL[raw] ?? ARC_BOUNTY_STATE.none,
    stateLabel: ARC_V1_TASK_STATES[raw] ?? `State ${raw}`,
    offerId: BigInt(0),
    termsHash: value[6],
    metadataHash: ZERO_HASH,
    deliveryHash: value[7],
  };
};

export const normalizeV1Exchange = (id: bigint, value: V1ExchangeTuple, tokens: Map<string, TokenMeta>, feeBps: number): ArcAgreement => {
  const raw = Number(value[9]);
  return {
    id,
    maker: value[0],
    taker: value[1],
    token: value[2],
    ...tokenMeta(tokens, value[2]),
    collateral: value[3],
    acceptBy: value[4],
    settlementBy: value[5],
    feeBpsSnapshot: feeBps,
    makerDeclinePayoutBps: 0,
    makerTimeoutPayoutBps: 0,
    state: V1_EXCHANGE_STATE_TO_CANONICAL[raw] ?? ARC_AGREEMENT_STATE.none,
    stateLabel: ARC_V1_POINT_EXCHANGE_STATES[raw] ?? `State ${raw}`,
    termsHash: value[6],
    metadataHash: ZERO_HASH,
  };
};
