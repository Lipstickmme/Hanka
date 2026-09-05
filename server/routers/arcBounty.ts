import { isAddress } from "viem";
import { z } from "zod";
import { ARC_SOCIAL_INSTRUMENTS } from "../../shared/arcBountyTerms";
import { assertArcSocialSourceAvailable, createArcSocialOffer, listArcSocialBountyMetadata, listArcSocialOffers, recordArcSocialProofRetention, registerArcSocialBounty, registerArcSocialBountySource, reportArcSocialProofEarlyRemoval, reviewArcSocialProofEarlyRemoval } from "../market/arcBounties";
import { publicProcedure, rateLimitedPublicProcedure, router } from "../_core/trpc";
import { createWalletChallenge, verifyWalletChallenge } from "../market/walletProof";

const evmWallet = z.string().trim().refine(isAddress, "Connect a valid Arc EVM wallet.");
const escrowAddress = z.string().trim().refine(isAddress, "Arc escrow address is invalid.");
const taskId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const metric = z.number().int().nonnegative().max(10_000_000_000);
const sourceHandle = z.string().trim().min(1).max(16).regex(/^@?[A-Za-z0-9_]+$/, "Enter a valid X handle.");
const sourceMetrics = z.object({
  followerCount: metric.default(0), ethosScore: metric.default(0), kaitoScore: metric.default(0), kaitoAura: metric.default(0), isVerifiedClaim: z.boolean().default(false),
});
const socialTerms = z.object({
  title: z.string().trim().min(3).max(50), summary: z.string().trim().min(8).max(500),
  deliverables: z.array(z.string().trim().min(3).max(100)).min(1).max(10), projectSlug: z.string().trim().min(2).max(64),
  instrument: z.enum(ARC_SOCIAL_INSTRUMENTS), targetHandle: sourceHandle,
  proofDetail: z.string().trim().max(240).optional(), spaceMinutes: z.number().int().positive().max(720).optional(),
  retentionDays: z.union([z.literal(7), z.literal(14), z.literal(30), z.literal(60), z.literal(90)]),
  featuredToken: z.string().trim().max(80).optional(), location: z.string().trim().max(120).optional(),
  verificationMethod: z.enum(["onchain_delivery_commitment", "manual_evidence_reference"]).optional(),
  minimumFollowerCount: metric.optional(), minimumEthosScore: metric.optional(), minimumKaitoScore: metric.optional(), minimumKaitoAura: metric.optional(), requireVerifiedSource: z.boolean().optional(),
});

function assertConfiguredEscrow(input: string) {
  const configured = (process.env.HANKA_MARKET_V2_TESTNET_ADDRESS_2 ?? process.env.VITE_ARC_TESTNET_ESCROW_ADDRESS)?.trim();
  if (!configured || !isAddress(configured) || configured.toLowerCase() !== input.toLowerCase()) throw new Error("This Arc Bounty contract is not the configured HANKA Testnet escrow.");
}

export const arcBountyRouter = router({
  metadata: publicProcedure.input(z.object({ contractAddress: escrowAddress })).query(({ input }) => { assertConfiguredEscrow(input.contractAddress); return listArcSocialBountyMetadata(input.contractAddress); }),
  offers: publicProcedure.query(() => listArcSocialOffers()),
  offerChallenge: rateLimitedPublicProcedure.input(z.object({ wallet: evmWallet })).mutation(({ input }) => createWalletChallenge(input.wallet.toLowerCase(), "arc_social_offer")),
  createOffer: rateLimitedPublicProcedure.input(z.object({
    wallet: evmWallet, challengeId: z.string().min(1), signature: z.string().min(1), sourceHandle,
    subject: z.string().trim().min(2).max(64), instrument: z.enum(ARC_SOCIAL_INSTRUMENTS), availability: z.number().int().min(1).max(100),
  }).merge(sourceMetrics)).mutation(async ({ input }) => {
    await verifyWalletChallenge({ challengeId: input.challengeId, wallet: input.wallet.toLowerCase(), signature: input.signature, action: "arc_social_offer" });
    return createArcSocialOffer({ sellerWallet: input.wallet, sourceHandle: input.sourceHandle, subject: input.subject, instrument: input.instrument, availability: input.availability, followerCount: input.followerCount, ethosScore: input.ethosScore, kaitoScore: input.kaitoScore, kaitoAura: input.kaitoAura, isVerifiedClaim: input.isVerifiedClaim });
  }),
  register: rateLimitedPublicProcedure.input(z.object({ contractAddress: escrowAddress, taskId, requesterWallet: evmWallet }).merge(socialTerms)).mutation(({ input }) => { assertConfiguredEscrow(input.contractAddress); return registerArcSocialBounty(input); }),
  canClaim: rateLimitedPublicProcedure.input(z.object({ contractAddress: escrowAddress, taskId, takerWallet: evmWallet, sourceHandle }).merge(sourceMetrics)).mutation(({ input }) => { assertConfiguredEscrow(input.contractAddress); return assertArcSocialSourceAvailable(input); }),
  registerSource: rateLimitedPublicProcedure.input(z.object({ contractAddress: escrowAddress, taskId, takerWallet: evmWallet, sourceHandle, pointsPerUnit: z.number().int().positive().max(1_000_000_000) }).merge(sourceMetrics)).mutation(({ input }) => { assertConfiguredEscrow(input.contractAddress); return registerArcSocialBountySource(input); }),
  retentionStartChallenge: rateLimitedPublicProcedure.input(z.object({ wallet: evmWallet })).mutation(({ input }) => createWalletChallenge(input.wallet.toLowerCase(), "arc_social_retention_start")),
  startRetention: rateLimitedPublicProcedure.input(z.object({ contractAddress: escrowAddress, taskId, requesterWallet: evmWallet, challengeId: z.string().min(1), signature: z.string().min(1) })).mutation(async ({ input }) => {
    assertConfiguredEscrow(input.contractAddress);
    await verifyWalletChallenge({ challengeId: input.challengeId, wallet: input.requesterWallet.toLowerCase(), signature: input.signature, action: "arc_social_retention_start" });
    return recordArcSocialProofRetention(input);
  }),
  retentionReportChallenge: rateLimitedPublicProcedure.input(z.object({ wallet: evmWallet })).mutation(({ input }) => createWalletChallenge(input.wallet.toLowerCase(), "arc_social_retention_report")),
  reportEarlyRemoval: rateLimitedPublicProcedure.input(z.object({ contractAddress: escrowAddress, taskId, requesterWallet: evmWallet, evidenceReference: z.string().trim().min(8).max(2000), challengeId: z.string().min(1), signature: z.string().min(1) })).mutation(async ({ input }) => {
    assertConfiguredEscrow(input.contractAddress);
    await verifyWalletChallenge({ challengeId: input.challengeId, wallet: input.requesterWallet.toLowerCase(), signature: input.signature, action: "arc_social_retention_report" });
    return reportArcSocialProofEarlyRemoval(input);
  }),
  retentionReviewChallenge: rateLimitedPublicProcedure.input(z.object({ wallet: evmWallet })).mutation(({ input }) => createWalletChallenge(input.wallet.toLowerCase(), "arc_social_retention_review")),
  reviewEarlyRemoval: rateLimitedPublicProcedure.input(z.object({ contractAddress: escrowAddress, taskId, resolverWallet: evmWallet, confirmed: z.boolean(), reviewNote: z.string().trim().min(8).max(1000), challengeId: z.string().min(1), signature: z.string().min(1) })).mutation(async ({ input }) => {
    assertConfiguredEscrow(input.contractAddress);
    await verifyWalletChallenge({ challengeId: input.challengeId, wallet: input.resolverWallet.toLowerCase(), signature: input.signature, action: "arc_social_retention_review" });
    return reviewArcSocialProofEarlyRemoval(input);
  }),
});
