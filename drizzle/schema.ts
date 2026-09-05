import {
  boolean,
  bigint,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const updatedTimestamp = () => utcTimestamp("updatedAt").defaultNow().notNull().$onUpdate(() => new Date());

export const userRole = pgEnum("user_role", ["user", "admin"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  updatedAt: updatedTimestamp(),
  lastSignedIn: utcTimestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const requestStatus = pgEnum("request_status", [
  "awaiting_payment", "open", "filled", "awaiting_review", "completed", "cancelled", "disputed",
]);
export const vouchBand = pgEnum("vouch_band", [
  "under_1k", "1k_5k", "5k_10k", "10k_25k", "5k_25k", "25k_50k", "50k_plus", "25k_plus",
]);
export const marketInstrument = pgEnum("market_instrument", [
  "vouch", "slash", "follow", "repost", "comment", "space_listener", "space_speaker", "space_contributor", "hanka_points",
]);
export const sellerCommitmentStatus = pgEnum("seller_commitment_status", [
  "open", "awaiting_payment", "matched", "done", "under_review", "approved", "paid", "cancelled", "disputed",
]);
export const payoutStatus = pgEnum("payout_status", ["queued", "sent", "withheld"]);

export const marketProjects = pgTable(
  "marketProjects",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 64 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    description: text("description"),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
    updatedAt: updatedTimestamp(),
  },
  table => [uniqueIndex("marketProjects_slug_unique").on(table.slug)],
);

export const marketRequests = pgTable(
  "marketRequests",
  {
    id: serial("id").primaryKey(),
    publicId: varchar("publicId", { length: 24 }).notNull(),
    buyerWallet: varchar("buyerWallet", { length: 64 }).notNull(),
    targetHandle: varchar("targetHandle", { length: 80 }).notNull(),
    projectSlug: varchar("projectSlug", { length: 64 }).notNull().default("commonsmade"),
    instrument: marketInstrument("instrument").notNull().default("vouch"),
    proofDetail: varchar("proofDetail", { length: 240 }),
    spaceMinutes: integer("spaceMinutes"),
    vouchBand: vouchBand("vouchBand"),
    requestedQuantity: integer("requestedQuantity").notNull(),
    filledQuantity: integer("filledQuantity").notNull().default(0),
    pricePerVouch: numeric("pricePerVouch", { precision: 14, scale: 6 }).notNull(),
    totalUsdc: numeric("totalUsdc", { precision: 16, scale: 6 }).notNull(),
    platformFeeUsdc: numeric("platformFeeUsdc", { precision: 16, scale: 6 }).notNull().default("0.000000"),
    sellerNetUsdc: numeric("sellerNetUsdc", { precision: 16, scale: 6 }).notNull().default("0.000000"),
    paymentSignature: varchar("paymentSignature", { length: 128 }).unique(),
    paymentVerifiedAt: utcTimestamp("paymentVerifiedAt"),
    status: requestStatus("status").notNull().default("awaiting_payment"),
    buyerMarkedDoneAt: utcTimestamp("buyerMarkedDoneAt"),
    archiveEligibleAt: utcTimestamp("archiveEligibleAt").notNull(),
    archivedAt: utcTimestamp("archivedAt"),
    archiveSummary: text("archiveSummary"),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
    updatedAt: updatedTimestamp(),
  },
  table => [
    uniqueIndex("marketRequests_publicId_unique").on(table.publicId),
    index("marketRequests_status_createdAt_idx").on(table.status, table.createdAt),
    index("marketRequests_archiveEligibleAt_idx").on(table.archiveEligibleAt),
  ],
);

export const sellerCommitments = pgTable(
  "sellerCommitments",
  {
    id: serial("id").primaryKey(),
    publicId: varchar("publicId", { length: 24 }).notNull(),
    requestId: integer("requestId"),
    parentOfferId: integer("parentOfferId"),
    sellerWallet: varchar("sellerWallet", { length: 64 }).notNull(),
    profileHandle: varchar("profileHandle", { length: 80 }).notNull(),
    sourceHandle: varchar("sourceHandle", { length: 80 }),
    targetHandle: varchar("targetHandle", { length: 80 }),
    allocationKey: varchar("allocationKey", { length: 255 }),
    projectSlug: varchar("projectSlug", { length: 64 }).notNull().default("commonsmade"),
    instrument: marketInstrument("instrument").notNull().default("vouch"),
    proofDetail: varchar("proofDetail", { length: 240 }),
    spaceMinutes: integer("spaceMinutes"),
    vouchBand: vouchBand("vouchBand"),
    quantity: integer("quantity").notNull(),
    pointsPerUnit: integer("pointsPerUnit"),
    followerCount: integer("followerCount"),
    ethosScore: integer("ethosScore"),
    kaitoScore: integer("kaitoScore"),
    kaitoAura: integer("kaitoAura"),
    metricsVerifiedAt: utcTimestamp("metricsVerifiedAt"),
    retentionDays: integer("retentionDays").notNull().default(30),
    retentionStartsAt: utcTimestamp("retentionStartsAt"),
    retentionEndsAt: utcTimestamp("retentionEndsAt"),
    retentionViolationReportedAt: utcTimestamp("retentionViolationReportedAt"),
    retentionViolationEvidence: text("retentionViolationEvidence"),
    retentionViolationVerifiedAt: utcTimestamp("retentionViolationVerifiedAt"),
    retentionViolationNote: text("retentionViolationNote"),
    pricePerVouch: numeric("pricePerVouch", { precision: 14, scale: 6 }).notNull(),
    grossUsdc: numeric("grossUsdc", { precision: 16, scale: 6 }),
    platformFeeUsdc: numeric("platformFeeUsdc", { precision: 16, scale: 6 }),
    sellerNetUsdc: numeric("sellerNetUsdc", { precision: 16, scale: 6 }),
    buyerWallet: varchar("buyerWallet", { length: 64 }),
    paymentSignature: varchar("paymentSignature", { length: 128 }).unique(),
    paymentVerifiedAt: utcTimestamp("paymentVerifiedAt"),
    buyerMarkedDoneAt: utcTimestamp("buyerMarkedDoneAt"),
    status: sellerCommitmentStatus("status").notNull().default("open"),
    sellerMarkedDoneAt: utcTimestamp("sellerMarkedDoneAt"),
    archiveEligibleAt: utcTimestamp("archiveEligibleAt").notNull(),
    archivedAt: utcTimestamp("archivedAt"),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
    updatedAt: updatedTimestamp(),
  },
  table => [
    uniqueIndex("sellerCommitments_publicId_unique").on(table.publicId),
    uniqueIndex("sellerCommitments_allocationKey_unique").on(table.allocationKey),
    index("sellerCommitments_requestId_status_idx").on(table.requestId, table.status),
    index("sellerCommitments_parentOfferId_status_idx").on(table.parentOfferId, table.status),
    index("sellerCommitments_status_createdAt_idx").on(table.status, table.createdAt),
    index("sellerCommitments_retentionEndsAt_idx").on(table.retentionEndsAt),
  ],
);

export const sourceBans = pgTable(
  "sourceBans",
  {
    id: serial("id").primaryKey(),
    sourceHandle: varchar("sourceHandle", { length: 80 }).notNull(),
    sellerWallet: varchar("sellerWallet", { length: 64 }).notNull(),
    commitmentPublicId: varchar("commitmentPublicId", { length: 24 }).notNull(),
    reason: text("reason").notNull(),
    bannedByOpenId: varchar("bannedByOpenId", { length: 96 }).notNull(),
    bannedAt: utcTimestamp("bannedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("sourceBans_sourceHandle_unique").on(table.sourceHandle),
    index("sourceBans_sellerWallet_idx").on(table.sellerWallet),
  ],
);

export const walletChallenges = pgTable(
  "walletChallenges",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    wallet: varchar("wallet", { length: 64 }).notNull(),
    action: varchar("action", { length: 48 }).notNull(),
    message: text("message").notNull(),
    expiresAt: utcTimestamp("expiresAt").notNull(),
    usedAt: utcTimestamp("usedAt"),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("walletChallenges_wallet_action_idx").on(table.wallet, table.action)],
);

export const referralProfiles = pgTable(
  "referralProfiles",
  {
    id: serial("id").primaryKey(),
    wallet: varchar("wallet", { length: 64 }).notNull(),
    referralCode: varchar("referralCode", { length: 24 }).notNull(),
    referrerWallet: varchar("referrerWallet", { length: 64 }),
    directReferrals: integer("directReferrals").notNull().default(0),
    bonusReferralSlots: integer("bonusReferralSlots").notNull().default(0),
    pointsTotal: integer("pointsTotal").notNull().default(0),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
    updatedAt: updatedTimestamp(),
  },
  table => [
    uniqueIndex("referralProfiles_wallet_unique").on(table.wallet),
    uniqueIndex("referralProfiles_code_unique").on(table.referralCode),
    index("referralProfiles_points_idx").on(table.pointsTotal, table.createdAt),
  ],
);

export const pointLedger = pgTable(
  "pointLedger",
  {
    id: serial("id").primaryKey(),
    wallet: varchar("wallet", { length: 64 }).notNull(),
    amount: integer("amount").notNull(),
    eventType: varchar("eventType", { length: 48 }).notNull(),
    eventKey: varchar("eventKey", { length: 160 }).notNull(),
    sourceWallet: varchar("sourceWallet", { length: 64 }),
    level: integer("level").notNull().default(0),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("pointLedger_event_unique").on(table.eventKey, table.wallet),
    index("pointLedger_wallet_createdAt_idx").on(table.wallet, table.createdAt),
  ],
);

export const supportMessages = pgTable(
  "supportMessages",
  {
    id: serial("id").primaryKey(),
    publicId: varchar("publicId", { length: 24 }).notNull(),
    wallet: varchar("wallet", { length: 64 }).notNull(),
    subject: varchar("subject", { length: 120 }).notNull(),
    message: text("message").notNull(),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("supportMessages_publicId_unique").on(table.publicId),
    index("supportMessages_createdAt_idx").on(table.createdAt),
  ],
);

/**
 * Public presentation metadata for an already-funded Arc task. The escrow,
 * identities, amount, deadlines, terms commitment, and lifecycle remain
 * verifiable onchain; this table merely lets social-proof Bounties be readable.
 */
export const arcSocialBounties = pgTable(
  "arcSocialBounties",
  {
    id: serial("id").primaryKey(),
    contractAddress: varchar("contractAddress", { length: 42 }).notNull(),
    taskId: bigint("taskId", { mode: "number" }).notNull(),
    requesterWallet: varchar("requesterWallet", { length: 42 }).notNull(),
    title: varchar("title", { length: 50 }),
    summary: varchar("summary", { length: 500 }),
    deliverables: text("deliverables"),
    projectSlug: varchar("projectSlug", { length: 64 }).notNull(),
    instrument: marketInstrument("instrument").notNull(),
    targetHandle: varchar("targetHandle", { length: 80 }).notNull(),
    proofDetail: varchar("proofDetail", { length: 240 }),
    spaceMinutes: integer("spaceMinutes"),
    retentionDays: integer("retentionDays").notNull().default(30),
    featuredToken: varchar("featuredToken", { length: 80 }),
    location: varchar("location", { length: 120 }),
    verificationMethod: varchar("verificationMethod", { length: 80 }),
    minimumFollowerCount: integer("minimumFollowerCount").notNull().default(0),
    minimumEthosScore: integer("minimumEthosScore").notNull().default(0),
    minimumKaitoScore: integer("minimumKaitoScore").notNull().default(0),
    minimumKaitoAura: integer("minimumKaitoAura").notNull().default(0),
    requireVerifiedSource: boolean("requireVerifiedSource").notNull().default(false),
    termsHash: varchar("termsHash", { length: 66 }).notNull(),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
    updatedAt: updatedTimestamp(),
  },
  table => [
    uniqueIndex("arcSocialBounties_contract_task_unique").on(table.contractAddress, table.taskId),
    index("arcSocialBounties_target_instrument_idx").on(table.targetHandle, table.instrument),
    index("arcSocialBounties_requester_idx").on(table.requesterWallet),
  ],
);

/**
 * The source profile a verified Arc task taker associates with a social-proof
 * Bounty. It never controls payout: the contract's taker address and state do.
 */
export const arcSocialBountySources = pgTable(
  "arcSocialBountySources",
  {
    id: serial("id").primaryKey(),
    contractAddress: varchar("contractAddress", { length: 42 }).notNull(),
    taskId: bigint("taskId", { mode: "number" }).notNull(),
    takerWallet: varchar("takerWallet", { length: 42 }).notNull(),
    sourceHandle: varchar("sourceHandle", { length: 80 }).notNull(),
    pointsPerUnit: integer("pointsPerUnit").notNull(),
    followerCount: integer("followerCount"),
    ethosScore: integer("ethosScore"),
    kaitoScore: integer("kaitoScore"),
    kaitoAura: integer("kaitoAura"),
    isVerifiedClaim: boolean("isVerifiedClaim").notNull().default(false),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
    updatedAt: updatedTimestamp(),
  },
  table => [
    uniqueIndex("arcSocialBountySources_contract_task_unique").on(table.contractAddress, table.taskId),
    index("arcSocialBountySources_source_idx").on(table.sourceHandle),
    index("arcSocialBountySources_taker_idx").on(table.takerWallet),
  ],
);

/**
 * Seller-declared social-proof availability. Values are attached to the seller's
 * EVM wallet; HANKA does not fabricate or independently attest to the metrics.
 */
export const arcSocialOffers = pgTable(
  "arcSocialOffers",
  {
    id: serial("id").primaryKey(),
    sellerWallet: varchar("sellerWallet", { length: 42 }).notNull(),
    sourceHandle: varchar("sourceHandle", { length: 80 }).notNull(),
    subject: varchar("subject", { length: 64 }).notNull(),
    instrument: marketInstrument("instrument").notNull(),
    availability: integer("availability").notNull().default(1),
    followerCount: integer("followerCount").notNull().default(0),
    ethosScore: integer("ethosScore").notNull().default(0),
    kaitoScore: integer("kaitoScore").notNull().default(0),
    kaitoAura: integer("kaitoAura").notNull().default(0),
    isVerifiedClaim: boolean("isVerifiedClaim").notNull().default(false),
    isActive: boolean("isActive").notNull().default(true),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
    updatedAt: updatedTimestamp(),
  },
  table => [
    uniqueIndex("arcSocialOffers_wallet_source_instrument_unique").on(table.sellerWallet, table.sourceHandle, table.instrument),
    index("arcSocialOffers_instrument_idx").on(table.instrument),
    index("arcSocialOffers_seller_idx").on(table.sellerWallet),
  ],
);

/**
 * Retention begins only after the configured Arc escrow has paid a social-proof
 * Bounty. A requester may report one active-window removal. The publicly
 * configured contract resolver decides whether that report is confirmed.
 */
export const arcSocialProofRetentions = pgTable(
  "arcSocialProofRetentions",
  {
    id: serial("id").primaryKey(),
    contractAddress: varchar("contractAddress", { length: 42 }).notNull(),
    taskId: bigint("taskId", { mode: "number" }).notNull(),
    requesterWallet: varchar("requesterWallet", { length: 42 }).notNull(),
    takerWallet: varchar("takerWallet", { length: 42 }).notNull(),
    sourceHandle: varchar("sourceHandle", { length: 80 }).notNull(),
    retentionStartsAt: utcTimestamp("retentionStartsAt").notNull(),
    retentionEndsAt: utcTimestamp("retentionEndsAt").notNull(),
    reportedAt: utcTimestamp("reportedAt"),
    evidenceReference: text("evidenceReference"),
    reviewStatus: varchar("reviewStatus", { length: 16 }).notNull().default("active"),
    reviewedAt: utcTimestamp("reviewedAt"),
    resolverWallet: varchar("resolverWallet", { length: 42 }),
    reviewNote: text("reviewNote"),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
    updatedAt: updatedTimestamp(),
  },
  table => [
    uniqueIndex("arcSocialProofRetentions_contract_task_unique").on(table.contractAddress, table.taskId),
    index("arcSocialProofRetentions_source_status_idx").on(table.sourceHandle, table.reviewStatus),
    index("arcSocialProofRetentions_requester_idx").on(table.requesterWallet),
  ],
);

/** A confirmed restriction applies only to Arc social-proof offers and claims. */
export const arcSocialSourceBans = pgTable(
  "arcSocialSourceBans",
  {
    id: serial("id").primaryKey(),
    sourceHandle: varchar("sourceHandle", { length: 80 }).notNull(),
    sellerWallet: varchar("sellerWallet", { length: 42 }).notNull(),
    contractAddress: varchar("contractAddress", { length: 42 }).notNull(),
    taskId: bigint("taskId", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    resolverWallet: varchar("resolverWallet", { length: 42 }).notNull(),
    bannedAt: utcTimestamp("bannedAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("arcSocialSourceBans_source_unique").on(table.sourceHandle),
    index("arcSocialSourceBans_seller_idx").on(table.sellerWallet),
  ],
);

export const activityLogs = pgTable(
  "activityLogs",
  {
    id: serial("id").primaryKey(),
    entityType: varchar("entityType", { length: 32 }).notNull(),
    entityPublicId: varchar("entityPublicId", { length: 24 }).notNull(),
    eventType: varchar("eventType", { length: 64 }).notNull(),
    actorWallet: varchar("actorWallet", { length: 64 }),
    actorAdminOpenId: varchar("actorAdminOpenId", { length: 64 }),
    detail: text("detail"),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("activityLogs_entity_createdAt_idx").on(table.entityPublicId, table.createdAt)],
);

export const paymentSignatureClaims = pgTable(
  "paymentSignatureClaims",
  {
    signature: varchar("signature", { length: 128 }).primaryKey(),
    entityType: varchar("entityType", { length: 32 }).notNull(),
    entityPublicId: varchar("entityPublicId", { length: 24 }).notNull(),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("paymentSignatureClaims_entity_idx").on(table.entityPublicId)],
);

export const payoutRecords = pgTable(
  "payoutRecords",
  {
    id: serial("id").primaryKey(),
    sellerCommitmentId: integer("sellerCommitmentId").notNull(),
    recipientWallet: varchar("recipientWallet", { length: 64 }).notNull(),
    amountUsdc: numeric("amountUsdc", { precision: 16, scale: 6 }).notNull(),
    grossAmountUsdc: numeric("grossAmountUsdc", { precision: 16, scale: 6 }).notNull().default("0.000000"),
    platformFeeUsdc: numeric("platformFeeUsdc", { precision: 16, scale: 6 }).notNull().default("0.000000"),
    status: payoutStatus("status").notNull().default("queued"),
    externalReference: varchar("externalReference", { length: 160 }),
    adminNote: text("adminNote"),
    decidedByOpenId: varchar("decidedByOpenId", { length: 64 }).notNull(),
    decidedAt: utcTimestamp("decidedAt").defaultNow().notNull(),
    createdAt: utcTimestamp("createdAt").defaultNow().notNull(),
    updatedAt: updatedTimestamp(),
  },
  table => [
    uniqueIndex("payoutRecords_commitment_unique").on(table.sellerCommitmentId),
    index("payoutRecords_status_createdAt_idx").on(table.status, table.createdAt),
  ],
);

export type MarketRequest = typeof marketRequests.$inferSelect;
export type SellerCommitment = typeof sellerCommitments.$inferSelect;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type ArcSocialBounty = typeof arcSocialBounties.$inferSelect;
export type ArcSocialBountySource = typeof arcSocialBountySources.$inferSelect;
