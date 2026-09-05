import { formatUnits } from "viem";
import {
  ARC_AGREEMENT_STATE,
  ARC_BOUNTY_STATE,
  arcAgreementStateLabel,
  arcBountyStateLabel,
  type ArcAgreement,
  type ArcBounty,
} from "@/lib/arcTestnet";

export const shortAddress = (address?: string | null) =>
  address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—";

export const shortHash = (hash?: string | null) => (hash ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : "—");

/** Formats a token amount without the trailing-zero noise of raw formatUnits. */
export function formatTokenAmount(value: bigint, decimals: number, symbol?: string) {
  const raw = formatUnits(value, decimals);
  const trimmed = raw.includes(".") ? raw.replace(/0+$/, "").replace(/\.$/, "") : raw;
  const [whole, fraction] = trimmed.split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  const amount = fraction ? `${grouped}.${fraction}` : grouped;
  return symbol ? `${amount} ${symbol}` : amount;
}

export const formatDeadline = (seconds: bigint) => {
  if (seconds === BigInt(0)) return "—";
  return new Date(Number(seconds) * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/** "in 3 days" / "2 hours ago", for deadlines that need urgency, not precision. */
export function formatRelative(seconds: bigint, now = Date.now()) {
  if (seconds === BigInt(0)) return "—";
  const deltaMs = Number(seconds) * 1000 - now;
  const absolute = Math.abs(deltaMs);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["day", 86_400_000],
    ["hour", 3_600_000],
    ["minute", 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (absolute >= ms || unit === "minute") return formatter.format(Math.round(deltaMs / ms), unit);
  }
  return "—";
}

export const isPastDeadline = (seconds: bigint, now = Date.now()) => seconds > BigInt(0) && Number(seconds) * 1000 <= now;

export type RecordTone = "open" | "live" | "done" | "warn" | "dead";

const BOUNTY_TONES: Record<number, RecordTone> = {
  [ARC_BOUNTY_STATE.open]: "open",
  [ARC_BOUNTY_STATE.accepted]: "live",
  [ARC_BOUNTY_STATE.submitted]: "live",
  [ARC_BOUNTY_STATE.paid]: "done",
  [ARC_BOUNTY_STATE.retentionActive]: "live",
  [ARC_BOUNTY_STATE.retentionCase]: "warn",
  [ARC_BOUNTY_STATE.disputed]: "warn",
  [ARC_BOUNTY_STATE.settled]: "done",
  [ARC_BOUNTY_STATE.cancelled]: "dead",
  [ARC_BOUNTY_STATE.expired]: "dead",
};

const AGREEMENT_TONES: Record<number, RecordTone> = {
  [ARC_AGREEMENT_STATE.open]: "open",
  [ARC_AGREEMENT_STATE.funded]: "live",
  [ARC_AGREEMENT_STATE.disputed]: "warn",
  [ARC_AGREEMENT_STATE.settled]: "done",
  [ARC_AGREEMENT_STATE.cancelled]: "dead",
  [ARC_AGREEMENT_STATE.expired]: "dead",
};

export const bountyTone = (state: number): RecordTone => BOUNTY_TONES[state] ?? "dead";
export const agreementTone = (state: number): RecordTone => AGREEMENT_TONES[state] ?? "dead";
export const toneClass = (tone: RecordTone) => `hanka-chip hanka-chip-${tone}`;

/** A bounty is finished when no further lifecycle action is possible. */
export const isBountyClosed = (record: ArcBounty) =>
  [ARC_BOUNTY_STATE.paid, ARC_BOUNTY_STATE.settled, ARC_BOUNTY_STATE.cancelled, ARC_BOUNTY_STATE.expired].includes(
    record.state as never,
  );

export const isAgreementClosed = (record: ArcAgreement) =>
  [ARC_AGREEMENT_STATE.settled, ARC_AGREEMENT_STATE.cancelled, ARC_AGREEMENT_STATE.expired].includes(record.state as never);

export const bountyStateLabel = arcBountyStateLabel;
export const agreementStateLabel = arcAgreementStateLabel;

/** The contract escrows the reward; the taker receives it minus the snapshot fee. */
export const netBountyPayout = (record: ArcBounty) =>
  record.reward - (record.reward * BigInt(record.feeBpsSnapshot)) / BigInt(10_000);

export const feePercent = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;

/** Seconds since the epoch, as the contract's uint64 deadlines expect. */
export const toUnixSeconds = (value: string, label: string) => {
  const parsed = Math.floor(new Date(value).getTime() / 1000);
  if (!Number.isFinite(parsed)) throw new Error(`Enter a valid ${label.toLowerCase()}.`);
  if (parsed <= Math.floor(Date.now() / 1000)) throw new Error(`${label} must be in the future.`);
  return parsed;
};

/** Value for a datetime-local input, `days` from now, in the browser's zone. */
export const futureLocalInput = (days: number) => {
  const date = new Date(Date.now() + days * 86_400_000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
