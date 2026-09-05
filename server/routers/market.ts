import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { PublicKey } from "@solana/web3.js";
import { isAddress } from "viem";
import { publicProcedure, rateLimitedPublicProcedure, router } from "../_core/trpc";
import {
  activatePaidRequest,
  activateOfferPurchase,
  cancelUnpaidRequest,
  createRequest,
  createSellerOffer,
  createSupportMessage,
  delistSellerOffer,
  fillRequest,
  getParticipantActivity,
  getOfferPaymentDetails,
  getPaymentDetails,
  getPublicMarket,
  initiateOfferPurchase,
  markBuyerDone,
  markOfferBuyerDone,
  markSellerDone,
  recordVerifiedOfferPurchase,
  recordVerifiedPayment,
  reportEarlyRemoval,
} from "../market/db";
import { verifyArcUsdcManualOtcPayment } from "../market/arc";
import { verifyUsdcPayment } from "../market/solana";
import { USDC_MINT } from "../market/constants";
import { createWalletChallenge, verifyWalletChallenge } from "../market/walletProof";
import { awardReferralPoints, getReferralDashboard, getReferralLeaderboard, joinReferral } from "../market/referrals";

const wallet = z.string().trim().min(32).max(64).refine(value => {
  if (isAddress(value)) return true;
  try { new PublicKey(value); return true; } catch { return false; }
}, "Enter a valid Solana or Arc EVM wallet address");
const paymentRail = z.enum(["solana", "arc"]);
const instrument = z.enum(["vouch", "slash", "follow", "repost", "comment", "space_listener", "space_speaker", "space_contributor", "hanka_points"]);
const proofScope = z.string().trim().max(240).optional();
const spaceMinutes = z.number().int().positive().max(720).optional();
const proof = z.object({ challengeId: z.string().min(8), signature: z.string().min(20) });
const xHandle = z.string().trim().min(1).max(16).regex(/^@?[A-Za-z0-9_]+$/, "Enter a valid X handle");
const retentionDays = z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]);

function marketError(error: unknown): never {
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "The request could not be processed" });
}

async function grantReferralPoints(wallet: string, event: "seller_listing" | "buyer_purchase" | "seller_completion", eventKey: string) {
  try { await awardReferralPoints(wallet, event, eventKey); } catch (error) { console.warn(`[Referrals] Could not award ${event} for ${wallet.slice(0, 6)}…`, error); }
}

function paymentInstructions(rail: z.infer<typeof paymentRail>) {
  return rail === "arc"
    ? { rail, recipientWallet: process.env.VITE_ARC_OTC_RECIPIENT_ADDRESS ?? "", usdcMint: "0x3600000000000000000000000000000000000000" }
    : { rail, recipientWallet: process.env.SOLANA_RECIPIENT_WALLET ?? "", usdcMint: USDC_MINT };
}

export const marketRouter = router({
  board: publicProcedure.query(async () => getPublicMarket()),
  referralLeaderboard: publicProcedure.input(z.object({ page: z.number().int().positive().default(1), pageSize: z.number().int().positive().max(20).default(20) }).optional()).query(async ({ input }) => getReferralLeaderboard(input?.page ?? 1, input?.pageSize ?? 20)),
  joinReferral: rateLimitedPublicProcedure.input(z.object({ wallet, referralCode: z.string().trim().min(4).max(24).optional(), proof })).mutation(async ({ input }) => { try { await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "referral_join" }); return await joinReferral({ wallet: input.wallet, referralCode: input.referralCode }); } catch (error) { marketError(error); } }),
  referralDashboard: rateLimitedPublicProcedure.input(z.object({ wallet, proof })).mutation(async ({ input }) => { try { await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "referral_view" }); return await getReferralDashboard(input.wallet); } catch (error) { marketError(error); } }),
  activity: rateLimitedPublicProcedure
    .input(z.object({ wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "activity_view" });
        return getParticipantActivity(input.wallet);
      } catch (error) { marketError(error); }
    }),
  walletChallenge: rateLimitedPublicProcedure
    .input(z.object({ wallet, action: z.enum(["buyer_request", "seller_offer", "seller_fill", "buyer_done", "seller_done", "cancel_request", "seller_delist", "offer_buy", "offer_buyer_done", "activity_view", "support_message", "retention_report", "admin_access", "referral_join", "referral_view"]) }))
    .mutation(async ({ input }) => {
      try {
        return await createWalletChallenge(input.wallet, input.action);
      } catch (error) {
        marketError(error);
      }
    }),
  supportMessage: rateLimitedPublicProcedure
    .input(z.object({ wallet, subject: z.string().trim().max(120).optional(), message: z.string().trim().min(4).max(2_000), proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "support_message" });
        return await createSupportMessage({ wallet: input.wallet, subject: input.subject || "Customer support", message: input.message });
      } catch (error) {
        marketError(error);
      }
    }),
  reportEarlyRemoval: rateLimitedPublicProcedure
    .input(z.object({ commitmentPublicId: z.string().regex(/^(ASK|FILL)-/), wallet, evidence: z.string().trim().min(8).max(2_000), proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "retention_report" });
        return await reportEarlyRemoval({ commitmentPublicId: input.commitmentPublicId, reporterWallet: input.wallet, evidence: input.evidence });
      } catch (error) {
        marketError(error);
      }
    }),
  createRequest: rateLimitedPublicProcedure
    .input(z.object({ wallet, paymentRail, targetHandle: xHandle, projectSlug: z.string().trim().min(2).max(64).default("commonsmade"), instrument: instrument.default("vouch"), proofDetail: proofScope, spaceMinutes, quantity: z.number().int().positive().max(1_000_000), pricePerVouch: z.number().positive().max(10_000), proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "buyer_request" });
        const created = await createRequest({ buyerWallet: input.wallet, targetHandle: input.targetHandle.replace(/^@/, ""), projectSlug: input.projectSlug, instrument: input.instrument, proofDetail: input.proofDetail, spaceMinutes: input.spaceMinutes, requestedQuantity: input.quantity, pricePerVouch: input.pricePerVouch, totalUsdc: input.quantity * input.pricePerVouch });
        return { ...created, ...paymentInstructions(input.paymentRail) };
      } catch (error) {
        marketError(error);
      }
    }),
  paymentDetails: publicProcedure
    .input(z.object({ publicId: z.string().startsWith("REQ-"), wallet, paymentRail }))
    .query(async ({ input }) => {
      try {
        const details = await getPaymentDetails(input.publicId, input.wallet);
        return { ...details, ...paymentInstructions(input.paymentRail) };
      } catch (error) {
        marketError(error);
      }
    }),
  verifyPayment: rateLimitedPublicProcedure
    .input(z.object({ publicId: z.string().startsWith("REQ-"), wallet, paymentRail, signature: z.string().min(64).max(128) }))
    .mutation(async ({ input }) => {
      try {
        const request = await activatePaidRequest({ publicId: input.publicId, signature: input.signature, buyerWallet: input.wallet });
        if (input.paymentRail === "arc") await verifyArcUsdcManualOtcPayment({ hash: input.signature, buyerWallet: input.wallet, expectedUsdc: request.totalUsdc, earliestAllowedAt: request.createdAt });
        else await verifyUsdcPayment({ signature: input.signature, buyerWallet: input.wallet, expectedUsdc: request.totalUsdc, earliestAllowedAt: request.createdAt });
        await recordVerifiedPayment(input.publicId, input.signature, input.wallet);
        await grantReferralPoints(input.wallet, "buyer_purchase", `payment:${input.publicId}`);
        return { ok: true };
      } catch (error) {
        marketError(error);
      }
    }),
  createSellerOffer: rateLimitedPublicProcedure
    .input(z.object({ wallet, profileHandle: xHandle, projectSlug: z.string().trim().min(2).max(64).default("commonsmade"), instrument: instrument.default("vouch"), proofDetail: proofScope, spaceMinutes, quantity: z.number().int().positive().max(1_000_000), pointsPerUnit: z.number().int().positive().max(1_000_000_000), followerCount: z.number().int().nonnegative().max(10_000_000_000).optional(), ethosScore: z.number().int().nonnegative().max(10_000_000_000).optional(), kaitoScore: z.number().int().nonnegative().max(10_000_000_000).optional(), kaitoAura: z.number().int().nonnegative().max(10_000_000_000).optional(), retentionDays, pricePerVouch: z.number().positive().max(10_000), proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "seller_offer" });
        const created = await createSellerOffer({ sellerWallet: input.wallet, profileHandle: input.profileHandle.replace(/^@/, ""), projectSlug: input.projectSlug, instrument: input.instrument, proofDetail: input.proofDetail, spaceMinutes: input.spaceMinutes, quantity: input.quantity, pointsPerUnit: input.pointsPerUnit, followerCount: input.followerCount, ethosScore: input.ethosScore, kaitoScore: input.kaitoScore, kaitoAura: input.kaitoAura, retentionDays: input.retentionDays, pricePerVouch: input.pricePerVouch });
        await grantReferralPoints(input.wallet, "seller_listing", `listing:${created.publicId}`);
        return created;
      } catch (error) {
        marketError(error);
      }
    }),
  fillRequest: rateLimitedPublicProcedure
    .input(z.object({ requestPublicId: z.string().startsWith("REQ-"), wallet, profileHandle: xHandle, quantity: z.number().int().positive(), pointsPerUnit: z.number().int().positive().max(1_000_000_000), followerCount: z.number().int().nonnegative().max(10_000_000_000).optional(), ethosScore: z.number().int().nonnegative().max(10_000_000_000).optional(), kaitoScore: z.number().int().nonnegative().max(10_000_000_000).optional(), kaitoAura: z.number().int().nonnegative().max(10_000_000_000).optional(), retentionDays, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "seller_fill" });
        return await fillRequest({ requestPublicId: input.requestPublicId, sellerWallet: input.wallet, profileHandle: input.profileHandle.replace(/^@/, ""), quantity: input.quantity, pointsPerUnit: input.pointsPerUnit, followerCount: input.followerCount, ethosScore: input.ethosScore, kaitoScore: input.kaitoScore, kaitoAura: input.kaitoAura, retentionDays: input.retentionDays });
      } catch (error) {
        marketError(error);
      }
    }),
  initiateOfferPurchase: rateLimitedPublicProcedure
    .input(z.object({ publicId: z.string().startsWith("ASK-"), wallet, paymentRail, targetHandle: xHandle, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "offer_buy" });
        const created = await initiateOfferPurchase({ offerPublicId: input.publicId, buyerWallet: input.wallet, targetHandle: input.targetHandle });
        return { ...created, ...paymentInstructions(input.paymentRail) };
      } catch (error) { marketError(error); }
    }),
  offerPaymentDetails: publicProcedure
    .input(z.object({ publicId: z.string().startsWith("ASK-"), wallet, paymentRail }))
    .query(async ({ input }) => {
      try {
        const details = await getOfferPaymentDetails(input.publicId, input.wallet);
        return { ...details, ...paymentInstructions(input.paymentRail) };
      } catch (error) { marketError(error); }
    }),
  verifyOfferPayment: rateLimitedPublicProcedure
    .input(z.object({ publicId: z.string().startsWith("ASK-"), wallet, paymentRail, signature: z.string().min(64).max(128) }))
    .mutation(async ({ input }) => {
      try {
        const offer = await activateOfferPurchase({ publicId: input.publicId, signature: input.signature, buyerWallet: input.wallet });
        if (input.paymentRail === "arc") await verifyArcUsdcManualOtcPayment({ hash: input.signature, buyerWallet: input.wallet, expectedUsdc: offer.grossUsdc!, earliestAllowedAt: offer.createdAt });
        else await verifyUsdcPayment({ signature: input.signature, buyerWallet: input.wallet, expectedUsdc: offer.grossUsdc!, earliestAllowedAt: offer.createdAt });
        await recordVerifiedOfferPurchase(input.publicId, input.signature, input.wallet);
        await grantReferralPoints(input.wallet, "buyer_purchase", `offer-payment:${input.publicId}`);
        return { ok: true };
      } catch (error) { marketError(error); }
    }),
  delistSellerOffer: rateLimitedPublicProcedure
    .input(z.object({ publicId: z.string().startsWith("ASK-"), wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "seller_delist" });
        await delistSellerOffer(input.publicId, input.wallet);
        return { ok: true };
      } catch (error) { marketError(error); }
    }),
  markBuyerDone: rateLimitedPublicProcedure
    .input(z.object({ publicId: z.string().startsWith("REQ-"), wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "buyer_done" });
        await markBuyerDone(input.publicId, input.wallet);
        return { ok: true };
      } catch (error) {
        marketError(error);
      }
    }),
  markSellerDone: rateLimitedPublicProcedure
    .input(z.object({ publicId: z.string().regex(/^(FILL|ASK)-/), wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "seller_done" });
        await markSellerDone(input.publicId, input.wallet);
        await grantReferralPoints(input.wallet, "seller_completion", `completion:${input.publicId}`);
        return { ok: true };
      } catch (error) {
        marketError(error);
      }
    }),
  markOfferBuyerDone: rateLimitedPublicProcedure
    .input(z.object({ publicId: z.string().startsWith("ASK-"), wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "offer_buyer_done" });
        await markOfferBuyerDone(input.publicId, input.wallet);
        return { ok: true };
      } catch (error) { marketError(error); }
    }),
  cancelRequest: rateLimitedPublicProcedure
    .input(z.object({ publicId: z.string().startsWith("REQ-"), wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "cancel_request" });
        await cancelUnpaidRequest(input.publicId, input.wallet);
        return { ok: true };
      } catch (error) {
        marketError(error);
      }
    }),
});
