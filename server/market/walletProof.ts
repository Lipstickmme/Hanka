import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { isAddress, verifyMessage } from "viem";
import { walletChallenges } from "../../drizzle/schema";
import { getDb } from "../db";

const CHALLENGE_TTL_MS = 10 * 60 * 1000;

function walletNetwork(wallet: string): "arc" {
  if (!isAddress(wallet)) throw new Error("Enter a valid Arc EVM wallet address");
  return "arc";
}

export async function createWalletChallenge(wallet: string, action: string) {
  const network = walletNetwork(wallet);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const id = nanoid(20);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  const message = [
    "HANKA wallet confirmation",
    `Network: ${network === "arc" ? "Arc Testnet" : "Arc Testnet"}`,
    `Action: ${action}`,
    `Wallet: ${wallet}`,
    `Nonce: ${id}`,
    `Expires: ${expiresAt.toISOString()}`,
  ].join("\n");

  await db.insert(walletChallenges).values({ id, wallet, action, message, expiresAt });
  return { id, message, expiresAt };
}

export async function verifyWalletChallenge(input: {
  challengeId: string;
  wallet: string;
  signature: string;
  action: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable");

  const challenge = (await db.select().from(walletChallenges).where(eq(walletChallenges.id, input.challengeId)).limit(1))[0];
  if (!challenge || challenge.wallet !== input.wallet || challenge.action !== input.action) {
    throw new Error("Wallet confirmation is invalid");
  }
  if (challenge.usedAt || challenge.expiresAt.getTime() < Date.now()) {
    throw new Error("Wallet confirmation has expired; request a new one");
  }

  const network = walletNetwork(input.wallet);
  const verified = await verifyMessage({ address: input.wallet as `0x${string}`, message: challenge.message, signature: input.signature as `0x${string}` });
  if (!verified) throw new Error("Wallet signature could not be verified");

  await db.update(walletChallenges).set({ usedAt: new Date() }).where(eq(walletChallenges.id, input.challengeId));
}
