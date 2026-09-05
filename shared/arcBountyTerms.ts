export const ARC_SOCIAL_INSTRUMENTS = [
  "vouch",
  "slash",
  "follow",
  "repost",
  "comment",
  "space_listener",
  "space_speaker",
  "space_contributor",
  "hanka_points",
] as const;

export type ArcSocialInstrument = (typeof ARC_SOCIAL_INSTRUMENTS)[number];

export type ArcSocialBountyTermsInput = {
  title: string;
  summary: string;
  deliverables: string[];
  projectSlug: string;
  instrument: ArcSocialInstrument;
  targetHandle: string;
  proofDetail?: string | null;
  spaceMinutes?: number | null;
  retentionDays: number;
  featuredToken?: string | null;
  location?: string | null;
  verificationMethod?: string | null;
  minimumFollowerCount?: number | null;
  minimumEthosScore?: number | null;
  minimumKaitoScore?: number | null;
  minimumKaitoAura?: number | null;
  requireVerifiedSource?: boolean;
};

export function normalizeArcHandle(value: string) {
  return value.trim().replace(/^@/, "").toLowerCase();
}

export function normalizeArcTermsText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * This exact canonical text is hashed into the onchain task termsHash. It binds
 * public social-proof metadata to the funded Arc Bounty without writing private
 * brief details or delivery evidence to the contract.
 */
export function buildArcSocialBountyTerms(input: ArcSocialBountyTermsInput) {
  const title = normalizeArcTermsText(input.title);
  const summary = normalizeArcTermsText(input.summary);
  const deliverables = input.deliverables.map(normalizeArcTermsText).filter(Boolean);
  const proofDetail = normalizeArcTermsText(input.proofDetail ?? "");
  const spaceMinutes = input.spaceMinutes ? `${input.spaceMinutes} minutes` : "n/a";
  const featuredToken = normalizeArcTermsText(input.featuredToken ?? "") || "none";
  const location = normalizeArcTermsText(input.location ?? "") || "not specified";
  const verification = normalizeArcTermsText(input.verificationMethod ?? "") || "onchain delivery commitment";
  const minFollowers = input.minimumFollowerCount ?? 0;
  const minEthos = input.minimumEthosScore ?? 0;
  const minKaito = input.minimumKaitoScore ?? 0;
  const minAura = input.minimumKaitoAura ?? 0;
  return [
    "HANKA Arc Testnet social-proof Bounty",
    `Title: ${title}`,
    `Summary: ${summary}`,
    `Deliverables: ${deliverables.map((item, index) => `${index + 1}. ${item}`).join(" | ")}`,
    `Project: ${normalizeArcTermsText(input.projectSlug).toLowerCase()}`,
    `Proof: ${input.instrument}`,
    `Target: @${normalizeArcHandle(input.targetHandle)}`,
    `Scope: ${proofDetail || "standard proof action"}`,
    `Space duration: ${spaceMinutes}`,
    `Retention: ${input.retentionDays} days`,
    "Winners: 1 (current Arc Testnet contract limit)",
    `Featured token: ${featuredToken}`,
    `Location: ${location}`,
    `Verification: ${verification}`,
    `Minimum followers: ${minFollowers}`,
    `Minimum Ethos score: ${minEthos}`,
    `Minimum Kaito score: ${minKaito}`,
    `Minimum Kaito Aura: ${minAura}`,
    `Source verification required: ${input.requireVerifiedSource ? "self-attested" : "not required"}`,
    "Safety attestation: no illegal, exploitative, prohibited, or misrepresented work is requested.",
    "One source completes one proof action for the named target.",
    "Metric requirements are claimant-provided and checked by HANKA before its app flow submits acceptance; the current generic task contract itself does not designate a source wallet.",
    "Reward is held by the HANKA Arc Testnet contract and releases only through its Bounty lifecycle.",
  ].join("\n");
}
