export function enforceAvailableFill(remainingQuantity: number, fillQuantity: number) {
  if (!Number.isInteger(fillQuantity) || fillQuantity <= 0) {
    throw new Error("Fill quantity must be a positive whole number");
  }
  if (fillQuantity > remainingQuantity) {
    throw new Error("This fill exceeds the remaining request quantity");
  }
}

export function normalizeXHandle(handle: string) {
  const normalized = handle.trim().replace(/^@/, "").toLowerCase();
  if (!/^[a-z0-9_]{1,15}$/.test(normalized)) {
    throw new Error("Enter a valid X handle without the @ symbol");
  }
  return normalized;
}

export function enforceSingleUnitAllocation(quantity: number) {
  if (quantity !== 1) {
    throw new Error("Each social-proof allocation must be exactly one unit for one target account");
  }
}

export function enforcePointsPerUnit(pointsPerUnit: number) {
  if (!Number.isInteger(pointsPerUnit) || pointsPerUnit <= 0 || pointsPerUnit > 1_000_000_000) {
    throw new Error("Points per unit must be a positive whole number");
  }
}

export const RETENTION_DAYS_OPTIONS = [7, 14, 30, 60, 90] as const;
export type RetentionDays = (typeof RETENTION_DAYS_OPTIONS)[number];

export function enforceRetentionDays(retentionDays: number): asserts retentionDays is RetentionDays {
  if (!RETENTION_DAYS_OPTIONS.includes(retentionDays as RetentionDays)) {
    throw new Error(`Choose a retention period of ${RETENTION_DAYS_OPTIONS.join(", ")} days`);
  }
}

export function retentionEndsAt(retentionStartsAt: Date, retentionDays: number) {
  enforceRetentionDays(retentionDays);
  return new Date(retentionStartsAt.getTime() + retentionDays * 24 * 60 * 60 * 1000);
}

export function retentionWindowIsActive(retentionEndsAt: Date | null | undefined, now = new Date()) {
  return Boolean(retentionEndsAt && now.getTime() < retentionEndsAt.getTime());
}

export function enforceVerifiableEarlyRemoval(input: {
  sellerMarkedDoneAt: Date | null | undefined;
  retentionEndsAt: Date | null | undefined;
  now?: Date;
}) {
  if (!input.sellerMarkedDoneAt || !input.retentionEndsAt) {
    throw new Error("This proof has not entered its retention period");
  }
  if (!retentionWindowIsActive(input.retentionEndsAt, input.now)) {
    throw new Error("This proof's retention period has already expired");
  }
}

export function enforceSourceNotRestricted(restricted: boolean) {
  if (restricted) {
    throw new Error("This source is restricted from new HANKA listings after a verified retention violation");
  }
}

export function allocationKey(input: { sourceHandle: string; targetHandle: string; projectSlug: string; instrument: MarketInstrument }) {
  const sourceHandle = normalizeXHandle(input.sourceHandle);
  const targetHandle = normalizeXHandle(input.targetHandle);
  if (sourceHandle === targetHandle) {
    throw new Error("A source account cannot allocate social proof to itself");
  }
  return [input.projectSlug.toLowerCase(), input.instrument, sourceHandle, targetHandle].join(":");
}

export function assertUnusedPaymentSignature(signatureAlreadyUsed: boolean) {
  if (signatureAlreadyUsed) {
    throw new Error("This payment signature has already been used");
  }
}

export function enforceWalletOwnership(expectedWallet: string, submittedWallet: string) {
  if (expectedWallet !== submittedWallet) {
    throw new Error("This wallet is not authorized for the selected record");
  }
}

export function nextRequestStatusAfterCompletions(input: {
  requestedQuantity: number;
  filledQuantity: number;
  buyerMarkedDone: boolean;
  sellerMarkedDone: boolean[];
}) {
  const requestIsFull = input.filledQuantity === input.requestedQuantity;
  const everySellerMarkedDone = input.sellerMarkedDone.length > 0 && input.sellerMarkedDone.every(Boolean);
  return requestIsFull && input.buyerMarkedDone && everySellerMarkedDone ? "awaiting_review" : "filled";
}

export function nextRequestStatusAfterPayouts(statuses: Array<"paid" | "disputed" | "under_review">) {
  if (statuses.some(status => status === "disputed")) return "disputed";
  if (statuses.length > 0 && statuses.every(status => status === "paid")) return "completed";
  return "awaiting_review";
}

export function nextDirectPurchaseStatus(buyerMarkedDone: boolean, sellerMarkedDone: boolean) {
  return buyerMarkedDone && sellerMarkedDone ? "under_review" : "matched";
}

export function enforceDelistableOffer(input: { status: string; requestId: number | null; sellerWallet: string; wallet: string }) {
  enforceWalletOwnership(input.sellerWallet, input.wallet);
  if (input.status !== "open" || input.requestId !== null) {
    throw new Error("Only an uncommitted open seller offer can be delisted");
  }
}

export type DirectPurchaseProgress = { status: "open" | "awaiting_payment" | "matched" | "done" | "under_review"; buyerMarkedDone: boolean; sellerMarkedDone: boolean };

export function transitionDirectPurchase(progress: DirectPurchaseProgress, event: "reserve" | "payment_verified" | "buyer_confirmed" | "seller_completed") {
  if (event === "reserve") {
    if (progress.status !== "open") throw new Error("This seller offer is no longer available");
    return { ...progress, status: "awaiting_payment" as const };
  }
  if (event === "payment_verified") {
    if (progress.status !== "awaiting_payment") throw new Error("This offer purchase cannot be activated");
    return { ...progress, status: "matched" as const };
  }
  if (event === "buyer_confirmed") {
    if (!["matched", "done"].includes(progress.status)) throw new Error("This purchase cannot be confirmed yet");
    return { ...progress, buyerMarkedDone: true, status: nextDirectPurchaseStatus(true, progress.sellerMarkedDone) };
  }
  if (progress.status !== "matched") throw new Error("This fill cannot be marked complete yet");
  return { ...progress, sellerMarkedDone: true, status: nextDirectPurchaseStatus(progress.buyerMarkedDone, true) };
}
import type { MarketInstrument } from "./constants";
