import { and, eq, inArray, or } from "drizzle-orm";
import { createPublicClient, http, isAddress, keccak256, parseAbi, stringToHex, type Address, type Hex } from "viem";
import { arcSocialBounties, arcSocialBountySources, arcSocialOffers, arcSocialProofRetentions, arcSocialSourceBans, sourceBans } from "../../drizzle/schema";
import { buildArcSocialBountyTerms, normalizeArcHandle, normalizeArcTermsText, type ArcSocialBountyTermsInput } from "../../shared/arcBountyTerms";
import { getDb } from "../db";

const ARC_RPC_URL = "https://rpc.testnet.arc.io";
const ESCROW_READ_ABI = parseAbi([
  "function tasks(uint256 id) view returns (address requester, address taker, address token, uint128 reward, uint64 acceptDeadline, uint64 dueAt, bytes32 termsHash, bytes32 deliveryHash, uint8 state)",
  "function resolver() view returns (address)",
]);

type OnchainTask = readonly [Address, Address, Address, bigint, bigint, bigint, Hex, Hex, number];
type SocialBountyRegistration = ArcSocialBountyTermsInput & {
  contractAddress: string;
  taskId: number;
  requesterWallet: string;
};

function dbOrThrow() {
  return getDb().then(db => {
    if (!db) throw new Error("Database is unavailable");
    return db;
  });
}

function sameAddress(left: string, right: string) {
  return left.toLowerCase() === right.toLowerCase();
}

function hashTerms(terms: string) {
  return keccak256(stringToHex(normalizeArcTermsText(terms)));
}

async function readTask(contractAddress: string, taskId: number) {
  if (!isAddress(contractAddress)) throw new Error("Enter a valid Arc escrow contract address.");
  if (!Number.isSafeInteger(taskId) || taskId < 1) throw new Error("Enter a valid onchain Bounty ID.");
  return createPublicClient({ transport: http(ARC_RPC_URL) }).readContract({
    address: contractAddress,
    abi: ESCROW_READ_ABI,
    functionName: "tasks",
    args: [BigInt(taskId)],
  }) as Promise<OnchainTask>;
}

async function readResolver(contractAddress: string) {
  return createPublicClient({ transport: http(ARC_RPC_URL) }).readContract({
    address: contractAddress as Address,
    abi: ESCROW_READ_ABI,
    functionName: "resolver",
  }) as Promise<Address>;
}

async function isArcSocialSourceRestricted(db: Awaited<ReturnType<typeof dbOrThrow>>, sourceHandle: string, wallet: string) {
  const [arcRestriction, legacyRestriction] = await Promise.all([
    db.select({ id: arcSocialSourceBans.id }).from(arcSocialSourceBans).where(or(
      eq(arcSocialSourceBans.sourceHandle, sourceHandle),
      eq(arcSocialSourceBans.sellerWallet, wallet.toLowerCase()),
    )).limit(1),
    db.select({ id: sourceBans.id }).from(sourceBans).where(or(
      eq(sourceBans.sourceHandle, sourceHandle),
      eq(sourceBans.sellerWallet, wallet.toLowerCase()),
    )).limit(1),
  ]);
  return Boolean(arcRestriction[0] || legacyRestriction[0]);
}

async function assertRequesterOwnsSocialBounty(input: SocialBountyRegistration) {
  if (!isAddress(input.requesterWallet)) throw new Error("Connect a valid Arc EVM wallet.");
  const task = await readTask(input.contractAddress, input.taskId);
  if (!sameAddress(task[0], input.requesterWallet)) throw new Error("Only the onchain Bounty requester can publish its social-proof details.");
  if (task[8] === 0 || task[8] === 6) throw new Error("This onchain Bounty is not active.");
  const canonicalTerms = buildArcSocialBountyTerms(input);
  if (task[6].toLowerCase() !== hashTerms(canonicalTerms).toLowerCase()) {
    throw new Error("The social-proof details do not match this Bounty's onchain terms commitment.");
  }
  return { task, canonicalTerms };
}

export async function listArcSocialBountyMetadata(contractAddress: string) {
  const db = await getDb();
  if (!db || !isAddress(contractAddress)) return [];
  const rows = await db
    .select({
      taskId: arcSocialBounties.taskId,
      requesterWallet: arcSocialBounties.requesterWallet,
      title: arcSocialBounties.title,
      summary: arcSocialBounties.summary,
      deliverables: arcSocialBounties.deliverables,
      projectSlug: arcSocialBounties.projectSlug,
      instrument: arcSocialBounties.instrument,
      targetHandle: arcSocialBounties.targetHandle,
      proofDetail: arcSocialBounties.proofDetail,
      spaceMinutes: arcSocialBounties.spaceMinutes,
      retentionDays: arcSocialBounties.retentionDays,
      featuredToken: arcSocialBounties.featuredToken,
      location: arcSocialBounties.location,
      verificationMethod: arcSocialBounties.verificationMethod,
      minimumFollowerCount: arcSocialBounties.minimumFollowerCount,
      minimumEthosScore: arcSocialBounties.minimumEthosScore,
      minimumKaitoScore: arcSocialBounties.minimumKaitoScore,
      minimumKaitoAura: arcSocialBounties.minimumKaitoAura,
      requireVerifiedSource: arcSocialBounties.requireVerifiedSource,
      termsHash: arcSocialBounties.termsHash,
      sourceHandle: arcSocialBountySources.sourceHandle,
      takerWallet: arcSocialBountySources.takerWallet,
      pointsPerUnit: arcSocialBountySources.pointsPerUnit,
      followerCount: arcSocialBountySources.followerCount,
      ethosScore: arcSocialBountySources.ethosScore,
      kaitoScore: arcSocialBountySources.kaitoScore,
      kaitoAura: arcSocialBountySources.kaitoAura,
      isVerifiedClaim: arcSocialBountySources.isVerifiedClaim,
    })
    .from(arcSocialBounties)
    .leftJoin(arcSocialBountySources, and(
      eq(arcSocialBounties.contractAddress, arcSocialBountySources.contractAddress),
      eq(arcSocialBounties.taskId, arcSocialBountySources.taskId),
    ))
    .where(eq(arcSocialBounties.contractAddress, contractAddress.toLowerCase()));
  return rows;
}

export async function registerArcSocialBounty(input: SocialBountyRegistration) {
  const db = await dbOrThrow();
  const { task } = await assertRequesterOwnsSocialBounty(input);
  const contractAddress = input.contractAddress.toLowerCase();
  const normalizedTarget = normalizeArcHandle(input.targetHandle);
  await db.insert(arcSocialBounties).values({
    contractAddress,
    taskId: input.taskId,
    requesterWallet: input.requesterWallet.toLowerCase(),
    title: normalizeArcTermsText(input.title),
    summary: normalizeArcTermsText(input.summary),
    deliverables: input.deliverables.map(normalizeArcTermsText).join("\n"),
    projectSlug: normalizeArcTermsText(input.projectSlug).toLowerCase(),
    instrument: input.instrument,
    targetHandle: normalizedTarget,
    proofDetail: normalizeArcTermsText(input.proofDetail ?? "") || null,
    spaceMinutes: input.spaceMinutes ?? null,
    retentionDays: input.retentionDays,
    featuredToken: normalizeArcTermsText(input.featuredToken ?? "") || null,
    location: normalizeArcTermsText(input.location ?? "") || null,
    verificationMethod: input.verificationMethod ?? "onchain_delivery_commitment",
    minimumFollowerCount: input.minimumFollowerCount ?? 0,
    minimumEthosScore: input.minimumEthosScore ?? 0,
    minimumKaitoScore: input.minimumKaitoScore ?? 0,
    minimumKaitoAura: input.minimumKaitoAura ?? 0,
    requireVerifiedSource: input.requireVerifiedSource ?? false,
    termsHash: task[6].toLowerCase(),
  }).onConflictDoNothing();
  return { taskId: input.taskId, termsHash: task[6] };
}

export async function assertArcSocialSourceAvailable(input: { contractAddress: string; taskId: number; takerWallet: string; sourceHandle: string; followerCount?: number; ethosScore?: number; kaitoScore?: number; kaitoAura?: number; isVerifiedClaim?: boolean }) {
  if (!isAddress(input.takerWallet)) throw new Error("Connect a valid Arc EVM wallet.");
  const db = await dbOrThrow();
  const task = await readTask(input.contractAddress, input.taskId);
  if (task[8] !== 1) throw new Error("This Bounty is no longer open for acceptance.");
  const sourceHandle = normalizeArcHandle(input.sourceHandle);
  if (await isArcSocialSourceRestricted(db, sourceHandle, input.takerWallet)) throw new Error("This source is restricted from new HANKA social-proof Bounties.");
  const requirements = (await db.select({
    minimumFollowerCount: arcSocialBounties.minimumFollowerCount,
    minimumEthosScore: arcSocialBounties.minimumEthosScore,
    minimumKaitoScore: arcSocialBounties.minimumKaitoScore,
    minimumKaitoAura: arcSocialBounties.minimumKaitoAura,
    requireVerifiedSource: arcSocialBounties.requireVerifiedSource,
  }).from(arcSocialBounties).where(and(
    eq(arcSocialBounties.contractAddress, input.contractAddress.toLowerCase()),
    eq(arcSocialBounties.taskId, input.taskId),
  )).limit(1))[0];
  if (requirements && (
    (input.followerCount ?? 0) < requirements.minimumFollowerCount ||
    (input.ethosScore ?? 0) < requirements.minimumEthosScore ||
    (input.kaitoScore ?? 0) < requirements.minimumKaitoScore ||
    (input.kaitoAura ?? 0) < requirements.minimumKaitoAura ||
    (requirements.requireVerifiedSource && !input.isVerifiedClaim)
  )) throw new Error("This source profile does not meet the buyer's committed minimum requirements.");
  return { sourceHandle, requirements: requirements ?? null };
}

export async function registerArcSocialBountySource(input: {
  contractAddress: string;
  taskId: number;
  takerWallet: string;
  sourceHandle: string;
  pointsPerUnit: number;
  followerCount?: number;
  ethosScore?: number;
  kaitoScore?: number;
  kaitoAura?: number;
  isVerifiedClaim?: boolean;
}) {
  const db = await dbOrThrow();
  if (!isAddress(input.takerWallet)) throw new Error("Connect a valid Arc EVM wallet.");
  const task = await readTask(input.contractAddress, input.taskId);
  if (!sameAddress(task[1], input.takerWallet)) throw new Error("Only the onchain Bounty taker can attach a source profile.");
  if (![2, 3, 4, 5].includes(task[8])) throw new Error("The Bounty has not been accepted onchain.");
  const sourceHandle = normalizeArcHandle(input.sourceHandle);
  if (await isArcSocialSourceRestricted(db, sourceHandle, input.takerWallet)) throw new Error("This source is restricted from HANKA social-proof Bounties.");
  const requirements = (await db.select({
    minimumFollowerCount: arcSocialBounties.minimumFollowerCount,
    minimumEthosScore: arcSocialBounties.minimumEthosScore,
    minimumKaitoScore: arcSocialBounties.minimumKaitoScore,
    minimumKaitoAura: arcSocialBounties.minimumKaitoAura,
    requireVerifiedSource: arcSocialBounties.requireVerifiedSource,
  }).from(arcSocialBounties).where(and(
    eq(arcSocialBounties.contractAddress, input.contractAddress.toLowerCase()),
    eq(arcSocialBounties.taskId, input.taskId),
  )).limit(1))[0];
  if (requirements && (
    (input.followerCount ?? 0) < requirements.minimumFollowerCount ||
    (input.ethosScore ?? 0) < requirements.minimumEthosScore ||
    (input.kaitoScore ?? 0) < requirements.minimumKaitoScore ||
    (input.kaitoAura ?? 0) < requirements.minimumKaitoAura ||
    (requirements.requireVerifiedSource && !input.isVerifiedClaim)
  )) throw new Error("This source profile does not meet the buyer's committed minimum requirements.");
  await db.insert(arcSocialBountySources).values({
    contractAddress: input.contractAddress.toLowerCase(),
    taskId: input.taskId,
    takerWallet: input.takerWallet.toLowerCase(),
    sourceHandle,
    pointsPerUnit: input.pointsPerUnit,
    followerCount: input.followerCount,
    ethosScore: input.ethosScore,
    kaitoScore: input.kaitoScore,
    kaitoAura: input.kaitoAura,
    isVerifiedClaim: input.isVerifiedClaim ?? false,
  }).onConflictDoNothing();
  return { taskId: input.taskId, sourceHandle };
}

export async function getArcSocialBountiesForTasks(contractAddress: string, taskIds: number[]) {
  const db = await getDb();
  if (!db || !isAddress(contractAddress) || !taskIds.length) return [];
  return db.select().from(arcSocialBounties).where(and(
    eq(arcSocialBounties.contractAddress, contractAddress.toLowerCase()),
    inArray(arcSocialBounties.taskId, taskIds),
  ));
}

export async function listArcSocialOffers() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(arcSocialOffers).where(eq(arcSocialOffers.isActive, true)).orderBy(arcSocialOffers.createdAt);
}

export async function createArcSocialOffer(input: {
  sellerWallet: string;
  sourceHandle: string;
  subject: string;
  instrument: ArcSocialBountyTermsInput["instrument"];
  availability: number;
  followerCount: number;
  ethosScore: number;
  kaitoScore: number;
  kaitoAura: number;
  isVerifiedClaim: boolean;
}) {
  const db = await dbOrThrow();
  const sourceHandle = normalizeArcHandle(input.sourceHandle);
  if (await isArcSocialSourceRestricted(db, sourceHandle, input.sellerWallet)) {
    throw new Error("This source is restricted from publishing HANKA social-proof offers.");
  }
  await db.insert(arcSocialOffers).values({
    sellerWallet: input.sellerWallet.toLowerCase(),
    sourceHandle,
    subject: normalizeArcTermsText(input.subject),
    instrument: input.instrument,
    availability: input.availability,
    followerCount: input.followerCount,
    ethosScore: input.ethosScore,
    kaitoScore: input.kaitoScore,
    kaitoAura: input.kaitoAura,
    isVerifiedClaim: input.isVerifiedClaim,
  }).onConflictDoUpdate({
    target: [arcSocialOffers.sellerWallet, arcSocialOffers.sourceHandle, arcSocialOffers.instrument],
    set: {
      subject: normalizeArcTermsText(input.subject), availability: input.availability,
      followerCount: input.followerCount, ethosScore: input.ethosScore,
      kaitoScore: input.kaitoScore, kaitoAura: input.kaitoAura,
      isVerifiedClaim: input.isVerifiedClaim, isActive: true, updatedAt: new Date(),
    },
  });
  return { sourceHandle };
}

export async function recordArcSocialProofRetention(input: { contractAddress: string; taskId: number; requesterWallet: string }) {
  const db = await dbOrThrow();
  const task = await readTask(input.contractAddress, input.taskId);
  if (!sameAddress(task[0], input.requesterWallet)) throw new Error("Only the onchain requester can start a social-proof retention record.");
  if (task[8] !== 5) throw new Error("Retention begins only after this Bounty has paid onchain.");
  const [bounty, source] = await Promise.all([
    db.select().from(arcSocialBounties).where(and(eq(arcSocialBounties.contractAddress, input.contractAddress.toLowerCase()), eq(arcSocialBounties.taskId, input.taskId))).limit(1),
    db.select().from(arcSocialBountySources).where(and(eq(arcSocialBountySources.contractAddress, input.contractAddress.toLowerCase()), eq(arcSocialBountySources.taskId, input.taskId))).limit(1),
  ]);
  if (!bounty[0] || !source[0]) throw new Error("This paid Bounty has no registered social-proof source.");
  if (!sameAddress(source[0].takerWallet, task[1])) throw new Error("The registered source does not match the paid onchain claimant.");
  const retentionStartsAt = new Date();
  const retentionEndsAt = new Date(retentionStartsAt.getTime() + bounty[0].retentionDays * 86_400_000);
  await db.insert(arcSocialProofRetentions).values({
    contractAddress: input.contractAddress.toLowerCase(), taskId: input.taskId,
    requesterWallet: input.requesterWallet.toLowerCase(), takerWallet: source[0].takerWallet,
    sourceHandle: source[0].sourceHandle, retentionStartsAt, retentionEndsAt,
  }).onConflictDoNothing();
  return { taskId: input.taskId, sourceHandle: source[0].sourceHandle, retentionStartsAt, retentionEndsAt };
}

export async function reportArcSocialProofEarlyRemoval(input: { contractAddress: string; taskId: number; requesterWallet: string; evidenceReference: string }) {
  const db = await dbOrThrow();
  const retention = (await db.select().from(arcSocialProofRetentions).where(and(
    eq(arcSocialProofRetentions.contractAddress, input.contractAddress.toLowerCase()),
    eq(arcSocialProofRetentions.taskId, input.taskId),
  )).limit(1))[0];
  if (!retention || !sameAddress(retention.requesterWallet, input.requesterWallet)) throw new Error("Only the requester for a paid social-proof Bounty can report early removal.");
  if (retention.retentionEndsAt <= new Date()) throw new Error("The retention window has ended; no early-removal report can be opened.");
  if (retention.reviewStatus !== "active") throw new Error("This Bounty already has a retention report under review or resolved.");
  const reportedAt = new Date();
  await db.update(arcSocialProofRetentions).set({ reviewStatus: "reported", reportedAt, evidenceReference: normalizeArcTermsText(input.evidenceReference) }).where(eq(arcSocialProofRetentions.id, retention.id));
  return { taskId: input.taskId, sourceHandle: retention.sourceHandle, reportedAt };
}

export async function listArcSocialRetentionReports(contractAddress: string) {
  const db = await dbOrThrow();
  return db.select().from(arcSocialProofRetentions).where(and(
    eq(arcSocialProofRetentions.contractAddress, contractAddress.toLowerCase()),
    eq(arcSocialProofRetentions.reviewStatus, "reported"),
  ));
}

export async function reviewArcSocialProofEarlyRemoval(input: { contractAddress: string; taskId: number; resolverWallet: string; confirmed: boolean; reviewNote: string }) {
  const db = await dbOrThrow();
  const resolver = await readResolver(input.contractAddress);
  if (!sameAddress(resolver, input.resolverWallet)) throw new Error("Only the configured onchain resolver can review a social-proof retention report.");
  const retention = (await db.select().from(arcSocialProofRetentions).where(and(
    eq(arcSocialProofRetentions.contractAddress, input.contractAddress.toLowerCase()),
    eq(arcSocialProofRetentions.taskId, input.taskId),
  )).limit(1))[0];
  if (!retention || retention.reviewStatus !== "reported") throw new Error("No pending social-proof retention report exists for this Bounty.");
  const reviewedAt = new Date();
  await db.transaction(async tx => {
    await tx.update(arcSocialProofRetentions).set({ reviewStatus: input.confirmed ? "confirmed" : "dismissed", reviewedAt, resolverWallet: input.resolverWallet.toLowerCase(), reviewNote: normalizeArcTermsText(input.reviewNote) }).where(eq(arcSocialProofRetentions.id, retention.id));
    if (input.confirmed) {
      await tx.insert(arcSocialSourceBans).values({ sourceHandle: retention.sourceHandle, sellerWallet: retention.takerWallet, contractAddress: retention.contractAddress, taskId: retention.taskId, reason: normalizeArcTermsText(input.reviewNote), resolverWallet: input.resolverWallet.toLowerCase(), bannedAt: reviewedAt }).onConflictDoNothing();
      await tx.update(arcSocialOffers).set({ isActive: false, updatedAt: reviewedAt }).where(eq(arcSocialOffers.sourceHandle, retention.sourceHandle));
    }
  });
  return { taskId: input.taskId, sourceHandle: retention.sourceHandle, status: input.confirmed ? "confirmed" : "dismissed", reviewedAt };
}
