import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { rateLimitedPublicProcedure, router } from "../_core/trpc";
import { createMarketProject, getOperations, recordPayoutDecision, setLegacyOfferPoints, verifyEarlyRemovalAndBanSource, verifySellerMetrics } from "../market/db";
import { verifyWalletChallenge } from "../market/walletProof";
import { runMarketArchive } from "../market/archive";

const wallet = z.string().trim().min(32).max(64);
const proof = z.object({ challengeId: z.string().min(8), signature: z.string().min(20) });

export function configuredAdminWallets() {
  return [process.env.SOLANA_RECIPIENT_WALLET, ...(process.env.ADMIN_SOLANA_WALLETS ?? "").split(",")]
    .map(wallet => wallet?.trim())
    .filter((wallet): wallet is string => Boolean(wallet));
}

export function assertConfiguredAdminWallet(candidate: string) {
  if (!configuredAdminWallets().includes(candidate)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Connect an authorized administrator wallet to continue" });
  }
}

async function verifyAdminWallet(input: { wallet: string; proof: { challengeId: string; signature: string } }) {
  assertConfiguredAdminWallet(input.wallet);
  await verifyWalletChallenge({ ...input.proof, wallet: input.wallet, action: "admin_access" });
}

export const adminRouter = router({
  operations: rateLimitedPublicProcedure
    .input(z.object({ wallet, proof }))
    .mutation(async ({ input }) => {
      await verifyAdminWallet(input);
      return getOperations();
    }),
  createProject: rateLimitedPublicProcedure
    .input(z.object({ wallet, proof, slug: z.string().trim().regex(/^[a-z0-9-]+$/).min(2).max(64), name: z.string().trim().min(2).max(120), description: z.string().trim().max(800).optional() }))
    .mutation(async ({ input }) => {
      await verifyAdminWallet(input);
      return createMarketProject({ slug: input.slug, name: input.name, description: input.description });
    }),
  archiveEligible: rateLimitedPublicProcedure
    .input(z.object({ wallet, proof }))
    .mutation(async ({ input }) => {
      await verifyAdminWallet(input);
      return runMarketArchive();
    }),
  setLegacyOfferPoints: rateLimitedPublicProcedure
    .input(z.object({ offerPublicId: z.string().regex(/^ASK-/), pointsPerUnit: z.number().int().min(1).max(1_000_000_000), wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyAdminWallet(input);
        return await setLegacyOfferPoints({ ...input, adminWallet: input.wallet });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Point value could not be recorded" });
      }
    }),
  verifySellerMetrics: rateLimitedPublicProcedure
    .input(z.object({ commitmentPublicId: z.string().regex(/^(ASK|FILL)-/), wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyAdminWallet(input);
        return await verifySellerMetrics({ commitmentPublicId: input.commitmentPublicId, adminOpenId: `wallet:${input.wallet}` });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Seller metrics could not be verified" });
      }
    }),
  verifyEarlyRemovalAndBanSource: rateLimitedPublicProcedure
    .input(z.object({ commitmentPublicId: z.string().regex(/^(ASK|FILL)-/), reason: z.string().trim().min(8).max(1_000), wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyAdminWallet(input);
        return await verifyEarlyRemovalAndBanSource({ commitmentPublicId: input.commitmentPublicId, reason: input.reason, adminOpenId: `wallet:${input.wallet}` });
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "The retention violation could not be verified" });
      }
    }),
  recordPayout: rateLimitedPublicProcedure
    .input(z.object({ commitmentPublicId: z.string().regex(/^(FILL|ASK)-/), status: z.enum(["sent", "withheld"]), externalReference: z.string().trim().max(160).optional(), adminNote: z.string().trim().max(1000).optional(), wallet, proof }))
    .mutation(async ({ input }) => {
      try {
        await verifyAdminWallet(input);
        await recordPayoutDecision({ ...input, adminOpenId: `wallet:${input.wallet}` });
        return { ok: true };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Payout record could not be saved" });
      }
    }),
});
