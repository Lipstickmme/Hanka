import { and, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { lt } from "drizzle-orm";
import {
  activityLogs,
  marketProjects,
  marketRequests,
  paymentSignatureClaims,
  payoutRecords,
  sellerCommitments,
  sourceBans,
  supportMessages,
} from "../../drizzle/schema";
import { getDb } from "../db";
import { ARCHIVE_AFTER_MS, calculateMarketAmounts, DEFAULT_PROJECT, MARKET_INSTRUMENTS, type MarketInstrument } from "./constants";
import { allocationKey, assertUnusedPaymentSignature, enforceAvailableFill, enforceDelistableOffer, enforcePointsPerUnit, enforceRetentionDays, enforceSingleUnitAllocation, enforceSourceNotRestricted, enforceVerifiableEarlyRemoval, enforceWalletOwnership, nextDirectPurchaseStatus, nextRequestStatusAfterCompletions, nextRequestStatusAfterPayouts, normalizeXHandle, retentionEndsAt, transitionDirectPurchase } from "./rules";
import { removeArchiveMetadata } from "./visibility";
import { createDirectPurchaseIntent, createExactMarketIntent, createFillIntent } from "./instrumentLifecycle";

const DIRECT_PURCHASE_HOLD_MS = 15 * 60 * 1000;

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

async function assertSourceCanParticipate(sourceHandle: string, sellerWallet: string) {
  const db = await dbOrThrow();
  const restriction = (await db.select({ id: sourceBans.id }).from(sourceBans).where(or(
    eq(sourceBans.sourceHandle, sourceHandle),
    eq(sourceBans.sellerWallet, sellerWallet),
  )).limit(1))[0];
  enforceSourceNotRestricted(Boolean(restriction));
}

export async function logActivity(input: {
  entityType: "request" | "seller_commitment" | "payout" | "support_message";
  entityPublicId: string;
  eventType: string;
  actorWallet?: string;
  actorAdminOpenId?: string;
  detail?: string;
}) {
  const db = await dbOrThrow();
  await db.insert(activityLogs).values(input);
}

async function ensureDefaultProject() {
  const db = await dbOrThrow();
  await db.insert(marketProjects).values(DEFAULT_PROJECT).onConflictDoUpdate({
    target: marketProjects.slug,
    set: { name: DEFAULT_PROJECT.name, description: DEFAULT_PROJECT.description },
  });
}

async function releaseStaleDirectPurchaseReservations(now = new Date()) {
  const db = await dbOrThrow();
  const cutoff = new Date(now.getTime() - DIRECT_PURCHASE_HOLD_MS);
  const stale = await db.select().from(sellerCommitments).where(and(
    eq(sellerCommitments.status, "awaiting_payment"),
    isNull(sellerCommitments.paymentSignature),
    lt(sellerCommitments.updatedAt, cutoff),
  ));
  if (!stale.length) return 0;
  await db.transaction(async tx => {
    for (const allocation of stale) {
      if (allocation.parentOfferId) {
        await tx.update(sellerCommitments).set({
          quantity: sql`${sellerCommitments.quantity} + 1`,
          status: "open",
        }).where(and(
          eq(sellerCommitments.id, allocation.parentOfferId),
          inArray(sellerCommitments.status, ["open", "matched"]),
        ));
        await tx.update(sellerCommitments).set({ status: "cancelled" }).where(eq(sellerCommitments.id, allocation.id));
      } else {
        await tx.update(sellerCommitments).set({
          status: "open",
          buyerWallet: null,
          grossUsdc: null,
          platformFeeUsdc: null,
          sellerNetUsdc: null,
          targetHandle: null,
          allocationKey: null,
        }).where(eq(sellerCommitments.id, allocation.id));
      }
    }
  });
  return stale.length;
}

export async function createMarketProject(input: { slug: string; name: string; description?: string }) {
  const db = await dbOrThrow();
  await db.insert(marketProjects).values({ slug: input.slug, name: input.name, description: input.description }).onConflictDoUpdate({
    target: marketProjects.slug,
    set: { name: input.name, description: input.description, isActive: true },
  });
  return { slug: input.slug };
}

export async function getPublicMarket() {
  const db = await getDb();
  if (!db) {
    if (process.env.NODE_ENV === "development") {
      return {
        projects: [DEFAULT_PROJECT],
        requests: [],
        sellerOffers: [],
        suggestedPriceByInstrument: Object.fromEntries(MARKET_INSTRUMENTS.map(({ value }) => [value, null])),
      };
    }
    throw new Error("Database is unavailable");
  }
  await ensureDefaultProject();
  await releaseStaleDirectPurchaseReservations();
  const [projects, requests, sellerOffers] = await Promise.all([
    db.select({ slug: marketProjects.slug, name: marketProjects.name, description: marketProjects.description }).from(marketProjects).where(eq(marketProjects.isActive, true)).orderBy(marketProjects.name),
    db
      .select({
        publicId: marketRequests.publicId,
        targetHandle: marketRequests.targetHandle,
        projectSlug: marketRequests.projectSlug,
        instrument: marketRequests.instrument,
        proofDetail: marketRequests.proofDetail,
        spaceMinutes: marketRequests.spaceMinutes,
        requestedQuantity: marketRequests.requestedQuantity,
        filledQuantity: marketRequests.filledQuantity,
        pricePerVouch: marketRequests.pricePerVouch,
        totalUsdc: marketRequests.totalUsdc,
        status: marketRequests.status,
        archivedAt: marketRequests.archivedAt,
        createdAt: marketRequests.createdAt,
      })
      .from(marketRequests)
      .where(and(isNull(marketRequests.archivedAt), inArray(marketRequests.status, ["open", "filled", "awaiting_review"])))
      .orderBy(desc(marketRequests.createdAt)),
    db
      .select({
        publicId: sellerCommitments.publicId,
        profileHandle: sellerCommitments.profileHandle,
        sourceHandle: sellerCommitments.sourceHandle,
        projectSlug: sellerCommitments.projectSlug,
        instrument: sellerCommitments.instrument,
        proofDetail: sellerCommitments.proofDetail,
        spaceMinutes: sellerCommitments.spaceMinutes,
        quantity: sellerCommitments.quantity,
        pointsPerUnit: sellerCommitments.pointsPerUnit,
        followerCount: sellerCommitments.followerCount,
        ethosScore: sellerCommitments.ethosScore,
        kaitoScore: sellerCommitments.kaitoScore,
        kaitoAura: sellerCommitments.kaitoAura,
        metricsVerifiedAt: sellerCommitments.metricsVerifiedAt,
        retentionDays: sellerCommitments.retentionDays,
        pricePerVouch: sellerCommitments.pricePerVouch,
        status: sellerCommitments.status,
        archivedAt: sellerCommitments.archivedAt,
        createdAt: sellerCommitments.createdAt,
      })
      .from(sellerCommitments)
      .where(and(isNull(sellerCommitments.requestId), isNull(sellerCommitments.parentOfferId), isNull(sellerCommitments.archivedAt), isNotNull(sellerCommitments.pointsPerUnit), eq(sellerCommitments.status, "open")))
      .orderBy(desc(sellerCommitments.createdAt)),
  ]);

  const visibleRequests = removeArchiveMetadata(requests);
  const visibleSellerOffers = removeArchiveMetadata(sellerOffers);
  const midpointFor = (instrument: MarketInstrument) => {
    const prices = [...visibleRequests, ...visibleSellerOffers]
      .filter(entry => entry.instrument === instrument)
      .map(entry => Number(entry.pricePerVouch))
      .filter(price => Number.isFinite(price) && price > 0)
      .sort((a, b) => a - b);
    const midpoint = prices.length ? prices[Math.floor(prices.length / 2)] : null;
    return midpoint?.toFixed(4) ?? null;
  };
  return {
    projects,
    requests: visibleRequests,
    sellerOffers: visibleSellerOffers,
    suggestedPriceByInstrument: Object.fromEntries(MARKET_INSTRUMENTS.map(({ value }) => [value, midpointFor(value)])),
  };
}

export async function createRequest(input: {
  buyerWallet: string;
  targetHandle: string;
  projectSlug: string;
  instrument: MarketInstrument;
  proofDetail?: string;
  spaceMinutes?: number;
  requestedQuantity: number;
  pricePerVouch: number;
  totalUsdc: number;
}) {
  const db = await dbOrThrow();
  const publicId = `REQ-${nanoid(8).toUpperCase()}`;
  const now = new Date();
  const intent = createExactMarketIntent(input.instrument, input.requestedQuantity);
  const targetHandle = normalizeXHandle(input.targetHandle);
  const amounts = calculateMarketAmounts(intent.quantity, input.pricePerVouch);
  await db.insert(marketRequests).values({
    ...input,
    targetHandle,
    instrument: intent.instrument,
    requestedQuantity: intent.quantity,
    publicId,
    pricePerVouch: input.pricePerVouch.toFixed(6),
    totalUsdc: amounts.grossUsdc,
    platformFeeUsdc: amounts.platformFeeUsdc,
    sellerNetUsdc: amounts.sellerNetUsdc,
    archiveEligibleAt: new Date(now.getTime() + ARCHIVE_AFTER_MS),
  });
  await logActivity({ entityType: "request", entityPublicId: publicId, eventType: "request_created", actorWallet: input.buyerWallet });
  return { publicId, totalUsdc: amounts.grossUsdc };
}

export async function activatePaidRequest(input: { publicId: string; signature: string; buyerWallet: string }) {
  const db = await dbOrThrow();
  const request = (await db.select().from(marketRequests).where(eq(marketRequests.publicId, input.publicId)).limit(1))[0];
  if (!request || request.buyerWallet !== input.buyerWallet || request.status !== "awaiting_payment") {
    throw new Error("This request cannot be activated");
  }
  const existingPayment = (await db.select().from(marketRequests).where(eq(marketRequests.paymentSignature, input.signature)).limit(1))[0];
  assertUnusedPaymentSignature(Boolean(existingPayment));
  return request;
}

export async function getPaymentDetails(publicId: string, buyerWallet: string) {
  const db = await dbOrThrow();
  const request = (await db.select().from(marketRequests).where(eq(marketRequests.publicId, publicId)).limit(1))[0];
  if (!request || request.buyerWallet !== buyerWallet || request.status !== "awaiting_payment") {
    throw new Error("No payment is due for this request and wallet");
  }
  return { publicId: request.publicId, totalUsdc: request.totalUsdc, targetHandle: request.targetHandle };
}

export async function recordVerifiedPayment(publicId: string, signature: string, buyerWallet: string) {
  const db = await dbOrThrow();
  try {
    await db.transaction(async tx => {
      await tx.insert(paymentSignatureClaims).values({ signature, entityType: "request", entityPublicId: publicId });
      const result = await tx
        .update(marketRequests)
        .set({ paymentSignature: signature, paymentVerifiedAt: new Date(), status: "open" })
        .where(and(eq(marketRequests.publicId, publicId), eq(marketRequests.buyerWallet, buyerWallet), eq(marketRequests.status, "awaiting_payment")))
        .returning({ id: marketRequests.id });
      if (!result.length) throw new Error("This request is no longer awaiting this wallet's payment");
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("This payment signature has already been used");
    throw error;
  }
  await logActivity({ entityType: "request", entityPublicId: publicId, eventType: "payment_verified" });
}

export async function createSellerOffer(input: {
  sellerWallet: string;
  profileHandle: string;
  projectSlug: string;
  instrument: MarketInstrument;
  proofDetail?: string;
  spaceMinutes?: number;
  quantity: number;
  pointsPerUnit: number;
  followerCount?: number;
  ethosScore?: number;
  kaitoScore?: number;
  kaitoAura?: number;
  pricePerVouch: number;
  retentionDays: number;
}) {
  const db = await dbOrThrow();
  const intent = createExactMarketIntent(input.instrument, input.quantity);
  enforcePointsPerUnit(input.pointsPerUnit);
  enforceRetentionDays(input.retentionDays);
  const sourceHandle = normalizeXHandle(input.profileHandle);
  await assertSourceCanParticipate(sourceHandle, input.sellerWallet);
  const publicId = `ASK-${nanoid(8).toUpperCase()}`;
  await db.insert(sellerCommitments).values({
    ...input,
    profileHandle: sourceHandle,
    sourceHandle,
    instrument: intent.instrument,
    quantity: intent.quantity,
    pointsPerUnit: input.pointsPerUnit,
    retentionDays: input.retentionDays,
    publicId,
    pricePerVouch: input.pricePerVouch.toFixed(6),
    archiveEligibleAt: new Date(Date.now() + ARCHIVE_AFTER_MS),
  });
  await logActivity({ entityType: "seller_commitment", entityPublicId: publicId, eventType: "seller_offer_created", actorWallet: input.sellerWallet });
  return { publicId, unitsPosted: intent.quantity };
}

export async function fillRequest(input: { requestPublicId: string; sellerWallet: string; profileHandle: string; quantity: number; pointsPerUnit: number; followerCount?: number; ethosScore?: number; kaitoScore?: number; kaitoAura?: number; retentionDays: number }) {
  const db = await dbOrThrow();
  const request = (await db.select().from(marketRequests).where(eq(marketRequests.publicId, input.requestPublicId)).limit(1))[0];
  if (!request || request.status !== "open") throw new Error("This request is not open for fills");
  enforceSingleUnitAllocation(input.quantity);
  enforcePointsPerUnit(input.pointsPerUnit);
  enforceRetentionDays(input.retentionDays);
  enforceAvailableFill(request.requestedQuantity - request.filledQuantity, input.quantity);
  const fillIntent = createFillIntent({ instrument: request.instrument, quantity: request.requestedQuantity - request.filledQuantity }, input.quantity);
  const sourceHandle = normalizeXHandle(input.profileHandle);
  await assertSourceCanParticipate(sourceHandle, input.sellerWallet);
  const targetHandle = normalizeXHandle(request.targetHandle);
  const pairKey = allocationKey({ sourceHandle, targetHandle, projectSlug: request.projectSlug, instrument: fillIntent.instrument });
  const existingAllocation = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.allocationKey, pairKey)).limit(1))[0];
  if (existingAllocation) {
    throw new Error(`@${sourceHandle} has already allocated this ${fillIntent.instrument} to @${targetHandle}`);
  }

  const publicId = `FILL-${nanoid(8).toUpperCase()}`;
  await db.transaction(async tx => {
    const updateResult = await tx
      .update(marketRequests)
      .set({
        filledQuantity: sql`${marketRequests.filledQuantity} + ${input.quantity}`,
        status: request.filledQuantity + input.quantity === request.requestedQuantity ? "filled" : "open",
      })
      .where(
        and(
          eq(marketRequests.id, request.id),
          eq(marketRequests.status, "open"),
          sql`${marketRequests.filledQuantity} + ${input.quantity} <= ${marketRequests.requestedQuantity}`,
        ),
      )
      .returning({ id: marketRequests.id });
    if (!updateResult.length) throw new Error("The request changed before this fill was recorded");
    await tx.insert(sellerCommitments).values({
      publicId,
      requestId: request.id,
      sellerWallet: input.sellerWallet,
      profileHandle: sourceHandle,
      sourceHandle,
      targetHandle,
      allocationKey: pairKey,
      projectSlug: request.projectSlug,
      instrument: fillIntent.instrument,
      proofDetail: request.proofDetail,
      spaceMinutes: request.spaceMinutes,
      quantity: fillIntent.quantity,
      pointsPerUnit: input.pointsPerUnit,
      retentionDays: input.retentionDays,
      followerCount: input.followerCount,
      ethosScore: input.ethosScore,
      kaitoScore: input.kaitoScore,
      kaitoAura: input.kaitoAura,
      pricePerVouch: request.pricePerVouch,
      grossUsdc: calculateMarketAmounts(fillIntent.quantity, Number(request.pricePerVouch)).grossUsdc,
      platformFeeUsdc: calculateMarketAmounts(fillIntent.quantity, Number(request.pricePerVouch)).platformFeeUsdc,
      sellerNetUsdc: calculateMarketAmounts(fillIntent.quantity, Number(request.pricePerVouch)).sellerNetUsdc,
      status: "matched",
      archiveEligibleAt: new Date(Date.now() + ARCHIVE_AFTER_MS),
    });
  });
  await logActivity({ entityType: "seller_commitment", entityPublicId: publicId, eventType: "request_filled", actorWallet: input.sellerWallet, detail: `${input.requestPublicId}:${sourceHandle}->${targetHandle}` });
  return { publicId };
}

export async function initiateOfferPurchase(input: { offerPublicId: string; buyerWallet: string; targetHandle: string }) {
  const db = await dbOrThrow();
  await releaseStaleDirectPurchaseReservations();
  const offer = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, input.offerPublicId)).limit(1))[0];
  if (!offer || offer.requestId || offer.parentOfferId || offer.status !== "open" || offer.quantity < 1) throw new Error("This seller offer is no longer available");
  const purchaseIntent = createDirectPurchaseIntent({ instrument: offer.instrument, quantity: 1 });
  const sourceHandle = normalizeXHandle(offer.sourceHandle ?? offer.profileHandle);
  await assertSourceCanParticipate(sourceHandle, offer.sellerWallet);
  const targetHandle = normalizeXHandle(input.targetHandle);
  const pairKey = allocationKey({ sourceHandle, targetHandle, projectSlug: offer.projectSlug, instrument: purchaseIntent.instrument });
  const existingAllocation = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.allocationKey, pairKey)).limit(1))[0];
  if (existingAllocation) {
    throw new Error(`@${sourceHandle} has already allocated this ${purchaseIntent.instrument} to @${targetHandle}`);
  }
  const amounts = calculateMarketAmounts(purchaseIntent.quantity, Number(offer.pricePerVouch));
  const allocationPublicId = `ASK-${nanoid(8).toUpperCase()}`;
  await db.transaction(async tx => {
    const result = await tx.update(sellerCommitments).set({
      quantity: sql`${sellerCommitments.quantity} - 1`,
      status: offer.quantity === 1 ? "matched" : "open",
    }).where(and(
      eq(sellerCommitments.id, offer.id),
      eq(sellerCommitments.status, "open"),
      sql`${sellerCommitments.quantity} >= 1`,
    )).returning({ id: sellerCommitments.id });
    if (!result.length) throw new Error("This seller offer was just claimed by another buyer");
    await tx.insert(sellerCommitments).values({
      publicId: allocationPublicId,
      parentOfferId: offer.id,
      sellerWallet: offer.sellerWallet,
      profileHandle: sourceHandle,
      sourceHandle,
      targetHandle,
      allocationKey: pairKey,
      projectSlug: offer.projectSlug,
      instrument: purchaseIntent.instrument,
      proofDetail: offer.proofDetail,
      spaceMinutes: offer.spaceMinutes,
      vouchBand: offer.vouchBand,
      quantity: 1,
      pointsPerUnit: offer.pointsPerUnit,
      followerCount: offer.followerCount,
      ethosScore: offer.ethosScore,
      kaitoScore: offer.kaitoScore,
      kaitoAura: offer.kaitoAura,
      retentionDays: offer.retentionDays,
      pricePerVouch: offer.pricePerVouch,
      grossUsdc: amounts.grossUsdc,
      platformFeeUsdc: amounts.platformFeeUsdc,
      sellerNetUsdc: amounts.sellerNetUsdc,
      buyerWallet: input.buyerWallet,
      status: "awaiting_payment",
      archiveEligibleAt: offer.archiveEligibleAt,
    });
  });
  await logActivity({ entityType: "seller_commitment", entityPublicId: allocationPublicId, eventType: "offer_purchase_started", actorWallet: input.buyerWallet, detail: `${sourceHandle}->${targetHandle}` });
  return { publicId: allocationPublicId, totalUsdc: amounts.grossUsdc };
}

export async function activateOfferPurchase(input: { publicId: string; signature: string; buyerWallet: string }) {
  const db = await dbOrThrow();
  const offer = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, input.publicId)).limit(1))[0];
  if (!offer || offer.buyerWallet !== input.buyerWallet || !offer.grossUsdc || transitionDirectPurchase({ status: offer.status as "awaiting_payment", buyerMarkedDone: false, sellerMarkedDone: false }, "payment_verified").status !== "matched") throw new Error("This offer purchase cannot be activated");
  const usedByRequest = (await db.select().from(marketRequests).where(eq(marketRequests.paymentSignature, input.signature)).limit(1))[0];
  const usedByOffer = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.paymentSignature, input.signature)).limit(1))[0];
  assertUnusedPaymentSignature(Boolean(usedByRequest || usedByOffer));
  return offer;
}

export async function recordVerifiedOfferPurchase(publicId: string, signature: string, buyerWallet: string) {
  const db = await dbOrThrow();
  try {
    await db.transaction(async tx => {
      await tx.insert(paymentSignatureClaims).values({ signature, entityType: "seller_commitment", entityPublicId: publicId });
      const result = await tx.update(sellerCommitments).set({ paymentSignature: signature, paymentVerifiedAt: new Date(), status: "matched" }).where(and(eq(sellerCommitments.publicId, publicId), eq(sellerCommitments.buyerWallet, buyerWallet), eq(sellerCommitments.status, "awaiting_payment"))).returning({ id: sellerCommitments.id });
      if (!result.length) throw new Error("This offer is no longer awaiting this wallet's payment");
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("This payment signature has already been used");
    throw error;
  }
  await logActivity({ entityType: "seller_commitment", entityPublicId: publicId, eventType: "offer_purchase_verified" });
}

export async function getOfferPaymentDetails(publicId: string, buyerWallet: string) {
  const db = await dbOrThrow();
  const offer = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, publicId)).limit(1))[0];
  if (!offer || offer.status !== "awaiting_payment" || offer.buyerWallet !== buyerWallet || !offer.grossUsdc) throw new Error("No payment is due for this offer and wallet");
  return { publicId: offer.publicId, totalUsdc: offer.grossUsdc, profileHandle: offer.profileHandle };
}

export async function delistSellerOffer(publicId: string, wallet: string) {
  const db = await dbOrThrow();
  const offer = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, publicId)).limit(1))[0];
  if (!offer) throw new Error("Only an uncommitted open seller offer can be delisted");
  enforceDelistableOffer({ status: offer.status, requestId: offer.requestId, sellerWallet: offer.sellerWallet, wallet });
  await db.update(sellerCommitments).set({ status: "cancelled" }).where(eq(sellerCommitments.id, offer.id));
  await logActivity({ entityType: "seller_commitment", entityPublicId: publicId, eventType: "seller_offer_delisted", actorWallet: wallet });
}

export async function setLegacyOfferPoints(input: { offerPublicId: string; pointsPerUnit: number; adminWallet: string }) {
  const db = await dbOrThrow();
  enforcePointsPerUnit(input.pointsPerUnit);
  const offer = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, input.offerPublicId)).limit(1))[0];
  if (!offer || offer.requestId || offer.parentOfferId || offer.status !== "open" || offer.pointsPerUnit != null) {
    throw new Error("Only an open legacy source offer without a declared point value can be repaired");
  }
  const result = await db.update(sellerCommitments).set({ pointsPerUnit: input.pointsPerUnit }).where(and(
    eq(sellerCommitments.id, offer.id),
    isNull(sellerCommitments.requestId),
    isNull(sellerCommitments.parentOfferId),
    eq(sellerCommitments.status, "open"),
    isNull(sellerCommitments.pointsPerUnit),
  )).returning({ id: sellerCommitments.id });
  if (!result.length) throw new Error("This legacy source offer changed before its point value could be recorded");
  await logActivity({
    entityType: "seller_commitment",
    entityPublicId: offer.publicId,
    eventType: "legacy_offer_points_recorded",
    actorWallet: input.adminWallet,
    detail: String(input.pointsPerUnit),
  });
  return { publicId: offer.publicId, pointsPerUnit: input.pointsPerUnit };
}

async function requestReadyForReview(requestId: number) {
  const db = await dbOrThrow();
  const request = (await db.select().from(marketRequests).where(eq(marketRequests.id, requestId)).limit(1))[0];
  if (!request) return;
  const commitments = await db.select().from(sellerCommitments).where(eq(sellerCommitments.requestId, requestId));
  if (nextRequestStatusAfterCompletions({
    requestedQuantity: request.requestedQuantity,
    filledQuantity: request.filledQuantity,
    buyerMarkedDone: Boolean(request.buyerMarkedDoneAt),
    sellerMarkedDone: commitments.map(item => Boolean(item.sellerMarkedDoneAt)),
  }) === "awaiting_review") {
    await db.update(marketRequests).set({ status: "awaiting_review" }).where(eq(marketRequests.id, requestId));
    await db.update(sellerCommitments).set({ status: "under_review" }).where(eq(sellerCommitments.requestId, requestId));
    await logActivity({ entityType: "request", entityPublicId: request.publicId, eventType: "all_participants_marked_done" });
  }
}

export async function markBuyerDone(publicId: string, wallet: string) {
  const db = await dbOrThrow();
  const request = (await db.select().from(marketRequests).where(eq(marketRequests.publicId, publicId)).limit(1))[0];
  if (!request || request.status !== "filled") throw new Error("This request cannot be marked complete yet");
  enforceWalletOwnership(request.buyerWallet, wallet);
  await db.update(marketRequests).set({ buyerMarkedDoneAt: new Date() }).where(eq(marketRequests.id, request.id));
  await logActivity({ entityType: "request", entityPublicId: publicId, eventType: "buyer_marked_done", actorWallet: wallet });
  await requestReadyForReview(request.id);
}

export async function markSellerDone(publicId: string, wallet: string) {
  const db = await dbOrThrow();
  const commitment = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, publicId)).limit(1))[0];
  if (!commitment || commitment.status !== "matched") throw new Error("This fill cannot be marked complete yet");
  enforceWalletOwnership(commitment.sellerWallet, wallet);
  const retentionStartsAt = new Date();
  await db.update(sellerCommitments).set({
    sellerMarkedDoneAt: retentionStartsAt,
    retentionStartsAt,
    retentionEndsAt: retentionEndsAt(retentionStartsAt, commitment.retentionDays),
    status: "done",
  }).where(eq(sellerCommitments.id, commitment.id));
  await logActivity({ entityType: "seller_commitment", entityPublicId: publicId, eventType: "seller_marked_done", actorWallet: wallet });
  if (commitment.requestId) await requestReadyForReview(commitment.requestId);
  else if (nextDirectPurchaseStatus(Boolean(commitment.buyerMarkedDoneAt), true) === "under_review") {
    await db.update(sellerCommitments).set({ status: "under_review" }).where(eq(sellerCommitments.id, commitment.id));
    await logActivity({ entityType: "seller_commitment", entityPublicId: publicId, eventType: "direct_purchase_ready_for_review" });
  }
}

export async function markOfferBuyerDone(publicId: string, wallet: string) {
  const db = await dbOrThrow();
  const offer = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, publicId)).limit(1))[0];
  if (!offer || offer.requestId || !["matched", "done"].includes(offer.status) || !offer.buyerWallet) throw new Error("This purchase cannot be confirmed yet");
  enforceWalletOwnership(offer.buyerWallet, wallet);
  await db.update(sellerCommitments).set({ buyerMarkedDoneAt: new Date() }).where(eq(sellerCommitments.id, offer.id));
  await logActivity({ entityType: "seller_commitment", entityPublicId: publicId, eventType: "direct_purchase_buyer_marked_done", actorWallet: wallet });
  if (nextDirectPurchaseStatus(true, Boolean(offer.sellerMarkedDoneAt)) === "under_review") {
    await db.update(sellerCommitments).set({ status: "under_review" }).where(eq(sellerCommitments.id, offer.id));
    await logActivity({ entityType: "seller_commitment", entityPublicId: publicId, eventType: "direct_purchase_ready_for_review" });
  }
}

export async function cancelUnpaidRequest(publicId: string, wallet: string) {
  const db = await dbOrThrow();
  const request = (await db.select().from(marketRequests).where(eq(marketRequests.publicId, publicId)).limit(1))[0];
  if (!request || request.status !== "awaiting_payment" || request.paymentSignature) {
    throw new Error("Only an unpaid request can be cancelled");
  }
  enforceWalletOwnership(request.buyerWallet, wallet);
  await db.update(marketRequests).set({ status: "cancelled" }).where(eq(marketRequests.id, request.id));
  await logActivity({ entityType: "request", entityPublicId: publicId, eventType: "unpaid_request_cancelled", actorWallet: wallet });
}

export async function createSupportMessage(input: { wallet: string; subject: string; message: string }) {
  const db = await dbOrThrow();
  const publicId = `SUP-${nanoid(10).toUpperCase()}`;
  const createdAt = new Date();
  await db.insert(supportMessages).values({ ...input, publicId, createdAt });
  await logActivity({ entityType: "support_message", entityPublicId: publicId, eventType: "support_message_submitted", actorWallet: input.wallet, detail: input.subject });
  return { publicId, createdAt };
}

export async function reportEarlyRemoval(input: { commitmentPublicId: string; reporterWallet: string; evidence: string }) {
  const db = await dbOrThrow();
  const commitment = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, input.commitmentPublicId)).limit(1))[0];
  if (!commitment) throw new Error("This proof commitment was not found");
  const linkedRequest = commitment.requestId
    ? (await db.select({ buyerWallet: marketRequests.buyerWallet }).from(marketRequests).where(eq(marketRequests.id, commitment.requestId)).limit(1))[0]
    : undefined;
  if (commitment.buyerWallet !== input.reporterWallet && linkedRequest?.buyerWallet !== input.reporterWallet) {
    throw new Error("Only the buyer for this proof can report an early removal");
  }
  if (commitment.retentionViolationReportedAt) throw new Error("This early-removal report is already awaiting operator review");
  enforceVerifiableEarlyRemoval({ sellerMarkedDoneAt: commitment.sellerMarkedDoneAt, retentionEndsAt: commitment.retentionEndsAt });
  const reportedAt = new Date();
  await db.update(sellerCommitments).set({
    retentionViolationReportedAt: reportedAt,
    retentionViolationEvidence: input.evidence,
  }).where(eq(sellerCommitments.id, commitment.id));
  await logActivity({ entityType: "seller_commitment", entityPublicId: commitment.publicId, eventType: "retention_removal_reported", actorWallet: input.reporterWallet, detail: "Private evidence submitted for operator review" });
  return { publicId: commitment.publicId, reportedAt };
}

export async function verifyEarlyRemovalAndBanSource(input: { commitmentPublicId: string; adminOpenId: string; reason: string }) {
  const db = await dbOrThrow();
  const commitment = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, input.commitmentPublicId)).limit(1))[0];
  if (!commitment) throw new Error("This proof commitment was not found");
  if (commitment.retentionViolationVerifiedAt) throw new Error("This retention violation has already been verified");
  enforceVerifiableEarlyRemoval({ sellerMarkedDoneAt: commitment.sellerMarkedDoneAt, retentionEndsAt: commitment.retentionEndsAt });
  const sourceHandle = normalizeXHandle(commitment.sourceHandle ?? commitment.profileHandle);
  const bannedAt = new Date();
  try {
    await db.transaction(async tx => {
      await tx.update(sellerCommitments).set({
        retentionViolationReportedAt: commitment.retentionViolationReportedAt ?? bannedAt,
        retentionViolationVerifiedAt: bannedAt,
        retentionViolationNote: input.reason,
      }).where(eq(sellerCommitments.id, commitment.id));
      await tx.insert(sourceBans).values({
        sourceHandle,
        sellerWallet: commitment.sellerWallet,
        commitmentPublicId: commitment.publicId,
        reason: input.reason,
        bannedByOpenId: input.adminOpenId,
        bannedAt,
      });
      await tx.update(sellerCommitments).set({ status: "cancelled" }).where(and(
        eq(sellerCommitments.sourceHandle, sourceHandle),
        isNull(sellerCommitments.requestId),
        isNull(sellerCommitments.parentOfferId),
        eq(sellerCommitments.status, "open"),
      ));
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw new Error("This source is already banned from HANKA listings");
    throw error;
  }
  await logActivity({ entityType: "seller_commitment", entityPublicId: commitment.publicId, eventType: "retention_violation_verified_source_banned", actorAdminOpenId: input.adminOpenId, detail: `@${sourceHandle}: ${input.reason}` });
  return { sourceHandle, bannedAt };
}

export async function getOperations() {
  const db = await dbOrThrow();
  const [requests, commitments, payouts, logs, supportRows, bans] = await Promise.all([
    db.select().from(marketRequests).orderBy(desc(marketRequests.createdAt)),
    db.select().from(sellerCommitments).orderBy(desc(sellerCommitments.createdAt)),
    db.select().from(payoutRecords).orderBy(desc(payoutRecords.createdAt)),
    db.select().from(activityLogs).orderBy(desc(activityLogs.createdAt)).limit(80),
    db.select().from(supportMessages).orderBy(desc(supportMessages.createdAt)).limit(100),
    db.select().from(sourceBans).orderBy(desc(sourceBans.bannedAt)),
  ]);
  const sourceOffers = commitments.filter(item => !item.requestId && !item.parentOfferId && item.status === "open");
  const tradeableSourceOffers = sourceOffers.filter(item => Boolean(item.pointsPerUnit));
  const requestById = new Map(requests.map(item => [item.id, item]));
  const payoutByCommitmentId = new Map(payouts.map(item => [item.sellerCommitmentId, item]));
  const transferQueue = commitments.filter(item => {
    if (item.status !== "under_review" || !item.sellerMarkedDoneAt || payoutByCommitmentId.has(item.id)) return false;
    const request = item.requestId ? requestById.get(item.requestId) : undefined;
    return Boolean(item.buyerMarkedDoneAt || request?.buyerMarkedDoneAt);
  }).map(item => {
    const amounts = calculateMarketAmounts(item.quantity, Number(item.pricePerVouch));
    return { publicId: item.publicId, sellerWallet: item.sellerWallet, quantity: item.quantity, instrument: item.instrument, profileHandle: item.profileHandle, sourceHandle: item.sourceHandle, targetHandle: item.targetHandle, grossUsdc: amounts.grossUsdc, platformFeeUsdc: amounts.platformFeeUsdc, sellerNetUsdc: amounts.sellerNetUsdc, buyerConfirmedAt: item.buyerMarkedDoneAt ?? (item.requestId ? requestById.get(item.requestId)?.buyerMarkedDoneAt : null), sellerMarkedDoneAt: item.sellerMarkedDoneAt };
  });
  const activeAllocations = commitments.filter(item => (item.requestId || item.parentOfferId) && ["awaiting_payment", "matched", "done", "under_review", "approved"].includes(item.status));
  const completedAllocations = commitments.filter(item => (item.requestId || item.parentOfferId) && ["paid", "disputed"].includes(item.status));
  return {
    requests,
    commitments,
    payouts,
    logs,
    supportMessages: supportRows,
    sourceBans: bans,
    transferQueue,
    metrics: {
      openSourceOffers: sourceOffers.length,
      availableUnits: tradeableSourceOffers.reduce((sum, item) => sum + item.quantity, 0),
      activeAllocations: activeAllocations.length,
      completedAllocations: completedAllocations.length,
      listingsMissingPoints: sourceOffers.filter(item => !item.pointsPerUnit).length,
      activeRetentions: commitments.filter(item => item.retentionEndsAt && item.retentionEndsAt.getTime() > Date.now()).length,
      sourceBans: bans.length,
    },
  };
}

export async function getParticipantActivity(wallet: string) {
  const db = await dbOrThrow();
  const [requests, fills, purchases] = await Promise.all([
    db
      .select({
        publicId: marketRequests.publicId,
        targetHandle: marketRequests.targetHandle,
        instrument: marketRequests.instrument,
        requestedQuantity: marketRequests.requestedQuantity,
        filledQuantity: marketRequests.filledQuantity,
        totalUsdc: marketRequests.totalUsdc,
        status: marketRequests.status,
        buyerMarkedDoneAt: marketRequests.buyerMarkedDoneAt,
      })
      .from(marketRequests)
      .where(eq(marketRequests.buyerWallet, wallet))
      .orderBy(desc(marketRequests.createdAt)),
    db
      .select({
        publicId: sellerCommitments.publicId,
        requestId: sellerCommitments.requestId,
        profileHandle: sellerCommitments.profileHandle,
        sourceHandle: sellerCommitments.sourceHandle,
        targetHandle: sellerCommitments.targetHandle,
        instrument: sellerCommitments.instrument,
        quantity: sellerCommitments.quantity,
        pointsPerUnit: sellerCommitments.pointsPerUnit,
        pricePerVouch: sellerCommitments.pricePerVouch,
        status: sellerCommitments.status,
        sellerMarkedDoneAt: sellerCommitments.sellerMarkedDoneAt,
        retentionDays: sellerCommitments.retentionDays,
        retentionStartsAt: sellerCommitments.retentionStartsAt,
        retentionEndsAt: sellerCommitments.retentionEndsAt,
        retentionViolationReportedAt: sellerCommitments.retentionViolationReportedAt,
        retentionViolationVerifiedAt: sellerCommitments.retentionViolationVerifiedAt,
      })
      .from(sellerCommitments)
      .where(eq(sellerCommitments.sellerWallet, wallet))
      .orderBy(desc(sellerCommitments.createdAt)),
    db
      .select({
        publicId: sellerCommitments.publicId,
        profileHandle: sellerCommitments.profileHandle,
        sourceHandle: sellerCommitments.sourceHandle,
        targetHandle: sellerCommitments.targetHandle,
        instrument: sellerCommitments.instrument,
        quantity: sellerCommitments.quantity,
        pointsPerUnit: sellerCommitments.pointsPerUnit,
        pricePerVouch: sellerCommitments.pricePerVouch,
        grossUsdc: sellerCommitments.grossUsdc,
        status: sellerCommitments.status,
        buyerMarkedDoneAt: sellerCommitments.buyerMarkedDoneAt,
        sellerMarkedDoneAt: sellerCommitments.sellerMarkedDoneAt,
        retentionDays: sellerCommitments.retentionDays,
        retentionStartsAt: sellerCommitments.retentionStartsAt,
        retentionEndsAt: sellerCommitments.retentionEndsAt,
        retentionViolationReportedAt: sellerCommitments.retentionViolationReportedAt,
        retentionViolationVerifiedAt: sellerCommitments.retentionViolationVerifiedAt,
      })
      .from(sellerCommitments)
      .where(eq(sellerCommitments.buyerWallet, wallet))
      .orderBy(desc(sellerCommitments.createdAt)),
  ]);
  return { requests, fills, purchases };
}

export async function verifySellerMetrics(input: { commitmentPublicId: string; adminOpenId: string }) {
  const db = await dbOrThrow();
  const commitment = (await db.select({ id: sellerCommitments.id, followerCount: sellerCommitments.followerCount, ethosScore: sellerCommitments.ethosScore, kaitoScore: sellerCommitments.kaitoScore, kaitoAura: sellerCommitments.kaitoAura }).from(sellerCommitments).where(eq(sellerCommitments.publicId, input.commitmentPublicId)).limit(1))[0];
  if (!commitment) throw new Error("Seller listing was not found");
  if ([commitment.followerCount, commitment.ethosScore, commitment.kaitoScore, commitment.kaitoAura].every(value => value == null)) throw new Error("This listing has no submitted metrics to verify");
  await db.update(sellerCommitments).set({ metricsVerifiedAt: new Date() }).where(eq(sellerCommitments.id, commitment.id));
  await logActivity({ entityType: "seller_commitment", entityPublicId: input.commitmentPublicId, eventType: "seller_metrics_verified", actorAdminOpenId: input.adminOpenId, detail: "Operator verified submitted source metrics" });
  return { ok: true, commitmentPublicId: input.commitmentPublicId };
}

export async function recordPayoutDecision(input: {
  commitmentPublicId: string;
  status: "sent" | "withheld";
  externalReference?: string;
  adminNote?: string;
  adminOpenId: string;
}) {
  const db = await dbOrThrow();
  const commitment = (await db.select().from(sellerCommitments).where(eq(sellerCommitments.publicId, input.commitmentPublicId)).limit(1))[0];
  if (!commitment || !["under_review", "approved"].includes(commitment.status)) throw new Error("This seller fill is not ready for a payout decision");
  const amounts = calculateMarketAmounts(commitment.quantity, Number(commitment.pricePerVouch));
  await db.insert(payoutRecords).values({
    sellerCommitmentId: commitment.id,
    recipientWallet: commitment.sellerWallet,
    amountUsdc: amounts.sellerNetUsdc,
    grossAmountUsdc: amounts.grossUsdc,
    platformFeeUsdc: amounts.platformFeeUsdc,
    status: input.status,
    externalReference: input.externalReference,
    adminNote: input.adminNote,
    decidedByOpenId: input.adminOpenId,
  });
  await db.update(sellerCommitments).set({ status: input.status === "sent" ? "paid" : "disputed" }).where(eq(sellerCommitments.id, commitment.id));
  if (commitment.requestId) {
    const siblingCommitments = await db.select().from(sellerCommitments).where(eq(sellerCommitments.requestId, commitment.requestId));
    const nextRequestStatus = nextRequestStatusAfterPayouts(siblingCommitments.map(item => {
      if (item.publicId === commitment.publicId) return input.status === "sent" ? "paid" : "disputed";
      return item.status === "paid" ? "paid" : item.status === "disputed" ? "disputed" : "under_review";
    }));
    await db.update(marketRequests).set({ status: nextRequestStatus }).where(eq(marketRequests.id, commitment.requestId));
  }
  await logActivity({ entityType: "payout", entityPublicId: commitment.publicId, eventType: `payout_${input.status}`, actorAdminOpenId: input.adminOpenId, detail: input.externalReference });
}
