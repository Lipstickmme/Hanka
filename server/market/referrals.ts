import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { pointLedger, referralProfiles, sellerCommitments } from "../../drizzle/schema";
import { getDb } from "../db";
import { LEADERBOARD_MAX_ENTRIES, REFERRAL_DIRECT_LIMIT, REFERRAL_REWARDS } from "./constants";

export type ReferralEvent = "direct_join" | "level_two_join" | "seller_listing" | "buyer_purchase" | "seller_completion";

function referralCode() {
  return `H-${nanoid(10).toUpperCase()}`;
}

async function dbOrThrow() {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");
  return db;
}

async function ensureProfile(wallet: string) {
  const db = await dbOrThrow();
  const current = (await db.select().from(referralProfiles).where(eq(referralProfiles.wallet, wallet)).limit(1))[0];
  if (current) return current;
  const created = await db.insert(referralProfiles).values({ wallet, referralCode: referralCode() }).returning();
  return created[0];
}

function eventAmount(eventType: ReferralEvent) {
  return REFERRAL_REWARDS[eventType === "direct_join" ? "directJoin" : eventType === "level_two_join" ? "levelTwoJoin" : eventType === "seller_listing" ? "sellerListing" : eventType === "buyer_purchase" ? "buyerPurchase" : "sellerCompletion"];
}

async function addPointEvent(tx: any, wallet: string, eventType: ReferralEvent, eventKey: string, sourceWallet?: string, level = 0) {
  const amount = eventAmount(eventType);
  const inserted = await tx.insert(pointLedger).values({ wallet, amount, eventType, eventKey, sourceWallet, level }).onConflictDoNothing({ target: [pointLedger.eventKey, pointLedger.wallet] }).returning({ id: pointLedger.id });
  if (!inserted.length) return false;
  await tx.update(referralProfiles).set({ pointsTotal: sql`${referralProfiles.pointsTotal} + ${amount}` }).where(eq(referralProfiles.wallet, wallet));
  if ((eventType === "seller_listing" || eventType === "buyer_purchase") && level === 0) {
    await tx.update(referralProfiles).set({ bonusReferralSlots: sql`LEAST(${referralProfiles.bonusReferralSlots} + 1, 10)` }).where(eq(referralProfiles.wallet, wallet));
  }
  return true;
}

export async function joinReferral(input: { wallet: string; referralCode?: string }) {
  const db = await dbOrThrow();
  let profile = await ensureProfile(input.wallet);
  if (profile.referrerWallet || !input.referralCode?.trim()) return { profile, joined: false };
  const referrer = (await db.select().from(referralProfiles).where(eq(referralProfiles.referralCode, input.referralCode.trim().toUpperCase())).limit(1))[0];
  if (!referrer || referrer.wallet === input.wallet) throw new Error("That referral code is invalid");
  if (referrer.directReferrals >= REFERRAL_DIRECT_LIMIT + referrer.bonusReferralSlots) throw new Error("That referral code has no open referral slots");
  const parent = referrer.referrerWallet ? (await db.select().from(referralProfiles).where(eq(referralProfiles.wallet, referrer.referrerWallet)).limit(1))[0] : undefined;
  await db.transaction(async tx => {
    const updated = await tx.update(referralProfiles).set({ referrerWallet: referrer.wallet }).where(and(eq(referralProfiles.wallet, input.wallet), sql`${referralProfiles.referrerWallet} IS NULL`)).returning();
    if (!updated.length) return;
    await tx.update(referralProfiles).set({ directReferrals: sql`${referralProfiles.directReferrals} + 1` }).where(eq(referralProfiles.wallet, referrer.wallet));
    await addPointEvent(tx, referrer.wallet, "direct_join", `join:${input.wallet}`, input.wallet, 1);
    if (parent) await addPointEvent(tx, parent.wallet, "level_two_join", `join:${input.wallet}`, input.wallet, 2);
  });
  profile = (await db.select().from(referralProfiles).where(eq(referralProfiles.wallet, input.wallet)).limit(1))[0];
  return { profile, joined: true };
}

export async function awardReferralPoints(wallet: string, eventType: Exclude<ReferralEvent, "direct_join" | "level_two_join">, eventKey: string) {
  const db = await dbOrThrow();
  const profile = await ensureProfile(wallet);
  await db.transaction(async tx => {
    await addPointEvent(tx, wallet, eventType, `${eventKey}:${wallet}`, wallet, 0);
    if (profile.referrerWallet) await addPointEvent(tx, profile.referrerWallet, eventType, `${eventKey}:${wallet}:l1`, wallet, 1);
    const parent = profile.referrerWallet ? (await tx.select().from(referralProfiles).where(eq(referralProfiles.wallet, profile.referrerWallet)).limit(1))[0] : undefined;
    if (parent?.referrerWallet) await addPointEvent(tx, parent.referrerWallet, eventType, `${eventKey}:${wallet}:l2`, wallet, 2);
  });
}

export async function getReferralDashboard(wallet: string) {
  const db = await dbOrThrow();
  const profile = await ensureProfile(wallet);
  const events = await db.select({ amount: pointLedger.amount, eventType: pointLedger.eventType, level: pointLedger.level, createdAt: pointLedger.createdAt }).from(pointLedger).where(eq(pointLedger.wallet, wallet)).orderBy(desc(pointLedger.createdAt)).limit(12);
  return { profile, directLimit: REFERRAL_DIRECT_LIMIT + profile.bonusReferralSlots, openSlots: Math.max(0, REFERRAL_DIRECT_LIMIT + profile.bonusReferralSlots - profile.directReferrals), events };
}

export async function getReferralLeaderboard(page = 1, pageSize = 20) {
  const safePageSize = Math.min(Math.max(Math.floor(pageSize), 1), 20);
  const safePage = Math.max(Math.floor(page), 1);
  const empty = { page: safePage, pageSize: safePageSize, entries: [], hasNextPage: false };
  const db = await getDb();
  if (!db) {
    if (process.env.NODE_ENV !== "production") return empty;
    throw new Error("Database is unavailable");
  }
  const offset = (safePage - 1) * safePageSize;
  if (offset >= LEADERBOARD_MAX_ENTRIES) return { page: safePage, pageSize: safePageSize, entries: [], hasNextPage: false };
  const entries = await db.select({ wallet: referralProfiles.wallet, referralCode: referralProfiles.referralCode, points: referralProfiles.pointsTotal, directReferrals: referralProfiles.directReferrals }).from(referralProfiles).orderBy(desc(referralProfiles.pointsTotal), desc(referralProfiles.createdAt)).limit(safePageSize).offset(offset);
  const wallets = entries.map(entry => entry.wallet);
  const commitments = wallets.length ? await db.select({ sellerWallet: sellerCommitments.sellerWallet, buyerWallet: sellerCommitments.buyerWallet, status: sellerCommitments.status, followerCount: sellerCommitments.followerCount, ethosScore: sellerCommitments.ethosScore, kaitoScore: sellerCommitments.kaitoScore, kaitoAura: sellerCommitments.kaitoAura, createdAt: sellerCommitments.createdAt }).from(sellerCommitments).where(sql`${sellerCommitments.sellerWallet} IN (${sql.join(wallets.map(wallet => sql`${wallet}`), sql`, `)}) OR ${sellerCommitments.buyerWallet} IN (${sql.join(wallets.map(wallet => sql`${wallet}`), sql`, `)})`).orderBy(desc(sellerCommitments.createdAt)) : [];
  const stats = new Map(wallets.map(wallet => [wallet, { completedSales: 0, completedPurchases: 0, followerCount: null as number | null, ethosScore: null as number | null, kaitoScore: null as number | null, kaitoAura: null as number | null }]));
  for (const commitment of commitments) {
    const current = stats.get(commitment.sellerWallet);
    if (current) { if (commitment.status === "paid") current.completedSales += 1; if (current.followerCount == null && commitment.followerCount != null) current.followerCount = commitment.followerCount; if (current.ethosScore == null && commitment.ethosScore != null) current.ethosScore = commitment.ethosScore; if (current.kaitoScore == null && commitment.kaitoScore != null) current.kaitoScore = commitment.kaitoScore; if (current.kaitoAura == null && commitment.kaitoAura != null) current.kaitoAura = commitment.kaitoAura; }
    if (commitment.buyerWallet && commitment.status === "paid") { const buyer = stats.get(commitment.buyerWallet); if (buyer) buyer.completedPurchases += 1; }
  }
  return { page: safePage, pageSize: safePageSize, entries: entries.map((entry, index) => ({ rank: offset + index + 1, ...entry, ...stats.get(entry.wallet) })), hasNextPage: offset + entries.length < LEADERBOARD_MAX_ENTRIES && entries.length === safePageSize };
}
