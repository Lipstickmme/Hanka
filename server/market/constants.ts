export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;
export const ARCHIVE_AFTER_MS = 24 * 60 * 60 * 1000;
export const MARKET_SUGGESTION_LABEL = "Market guidance only — not a platform-set price";
export const PLATFORM_FEE_BPS = 500;

export const VOUCH_BANDS = [
  { value: "under_1k", label: "Under 1k" },
  { value: "1k_5k", label: "1k–5k" },
  { value: "5k_10k", label: "5k–10k" },
  { value: "10k_25k", label: "10k–25k" },
  { value: "25k_50k", label: "25k–50k" },
  { value: "50k_plus", label: "50k+" },
] as const;

export type VouchBandValue = (typeof VOUCH_BANDS)[number]["value"];
export const MARKET_INSTRUMENTS = [
  { value: "vouch", label: "Ethos vouch", sourceLabel: "Vouch source" },
  { value: "slash", label: "Ethos slash", sourceLabel: "Slash source" },
  { value: "follow", label: "X follow", sourceLabel: "Following account" },
  { value: "repost", label: "X repost", sourceLabel: "Reposting account" },
  { value: "comment", label: "X comment", sourceLabel: "Commenting account" },
  { value: "space_listener", label: "X Space listener", sourceLabel: "Hosting account" },
  { value: "space_speaker", label: "X Space speaker", sourceLabel: "Hosting account" },
  { value: "space_contributor", label: "X Space contributor", sourceLabel: "Hosting account" },
  { value: "hanka_points", label: "HANKA Points", sourceLabel: "HANKA wallet" },
] as const;
export type MarketInstrument = (typeof MARKET_INSTRUMENTS)[number]["value"];
export function instrumentLabel(instrument: MarketInstrument) {
  return MARKET_INSTRUMENTS.find(item => item.value === instrument)?.label.toLowerCase() ?? "social proof";
}
export function isSpaceInstrument(instrument: MarketInstrument) {
  return instrument.startsWith("space_");
}

export const REFERRAL_DIRECT_LIMIT = 10;
export const LEADERBOARD_MAX_ENTRIES = 100;
export const REFERRAL_REWARDS = { directJoin: 10, levelTwoJoin: 5, sellerListing: 3, buyerPurchase: 5, sellerCompletion: 5 } as const;
export const DEFAULT_PROJECT = { slug: "commonsmade", name: "CommonsMade", description: "Trade CommonsMade vouches and slashes." } as const;

export function toUsdcMicro(amount: number): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("USDC amount must be a positive number");
  }

  return Math.round(amount * 10 ** USDC_DECIMALS);
}

export function decimalToUsdcMicro(amount: string): number {
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount.trim())) {
    throw new Error("USDC amount must contain up to six decimal places");
  }
  const [whole, fraction = ""] = amount.split(".");
  return Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0").slice(0, 6));
}

export function microToDecimal(amount: number): string {
  const whole = Math.floor(amount / 1_000_000);
  const fraction = Math.round(amount % 1_000_000).toString().padStart(6, "0");
  return `${whole}.${fraction}`;
}

export function calculatePlatformFee(grossMicro: number) {
  if (!Number.isSafeInteger(grossMicro) || grossMicro <= 0) {
    throw new Error("Gross amount must be a positive USDC micro-unit amount");
  }
  const feeMicro = Math.round((grossMicro * PLATFORM_FEE_BPS) / 10_000);
  return { grossMicro, feeMicro, sellerNetMicro: grossMicro - feeMicro };
}

export function calculateMarketAmounts(quantity: number, pricePerVouch: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new Error("Quantity must be a positive whole number");
  const unitMicro = toUsdcMicro(pricePerVouch);
  const grossMicro = unitMicro * quantity;
  if (!Number.isSafeInteger(grossMicro) || grossMicro <= 0) throw new Error("USDC amount is outside the supported range");
  const amounts = calculatePlatformFee(grossMicro);
  return {
    grossUsdc: microToDecimal(amounts.grossMicro),
    platformFeeUsdc: microToDecimal(amounts.feeMicro),
    sellerNetUsdc: microToDecimal(amounts.sellerNetMicro),
  };
}
