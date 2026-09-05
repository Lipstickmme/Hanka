import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  fallback,
  http,
  isAddress,
  keccak256,
  parseAbi,
  parseEventLogs,
  parseUnits,
  stringToHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_CHAIN_ID_HEX,
  ARC_TESTNET_EXPLORER_URL,
  ARC_TESTNET_TOKENS,
  HANKA_MARKET_V2_TESTNET_ADDRESS,
  arcExplorerAddressUrl,
  arcExplorerTxUrl,
  resolveArcRpcUrls,
  type ArcTokenSymbol,
} from "@shared/arcNetwork";

export { ARC_TESTNET_TOKENS, ARC_TESTNET_CHAIN_ID, type ArcTokenSymbol };

export type ArcEip1193Provider = Parameters<typeof custom>[0] & {
  isMetaMask?: boolean;
  isRabby?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;
  isTrust?: boolean;
  isRainbow?: boolean;
  providers?: ArcEip1193Provider[];
  on?: (event: string, listener: (...args: never[]) => void) => void;
  removeListener?: (event: string, listener: (...args: never[]) => void) => void;
};

type Eip6963Detail = { info: { uuid: string; name: string; icon?: string; rdns?: string }; provider: ArcEip1193Provider };

export type ArcWalletProvider = { id: string; name: string; icon?: string; rdns?: string; provider: ArcEip1193Provider };
export type ArcWalletState = { address: Address; chainId: number };

export const hankaArcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "ArcScan", url: ARC_TESTNET_EXPLORER_URL } },
  testnet: true,
});

export const arcExplorerTx = arcExplorerTxUrl;
export const arcExplorerAddress = arcExplorerAddressUrl;

// ---------------------------------------------------------------------------
// Contract interface
// ---------------------------------------------------------------------------

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

/**
 * The deployed HankaMarketV2 interface, transcribed from the compiled ABI of
 * contracts/src/HankaMarketV2.sol. Every name here exists on the contract at
 * `getArcContractAddress()`; a mismatch here is a silent, total outage, so
 * server/hanka.market-v2.contract.test.ts checks this list against the
 * compiler output rather than trusting review.
 */
export const hankaMarketV2Abi = parseAbi([
  "function bountyCount() view returns (uint256)",
  "function agreementCount() view returns (uint256)",
  "function socialOfferCount() view returns (uint256)",
  "function bounties(uint256) view returns (address requester, address taker, address token, address feeRecipient, uint128 reward, uint128 retentionBond, uint64 acceptBy, uint64 dueAt, uint64 reviewBy, uint64 retentionPeriod, uint64 retentionEndsAt, uint64 caseReviewPeriod, uint64 caseResolveBy, uint64 minimumFollowerCount, uint64 minimumEthosScore, uint64 minimumKaitoScore, uint64 minimumKaitoAura, uint16 feeBpsSnapshot, uint8 proofType, uint8 kind, uint8 state, bool caseDefaultToRequester, bool requireVerifiedSource, uint256 offerId, bytes32 termsHash, bytes32 metadataHash, bytes32 targetActionHash, bytes32 sourceIdentityHash, bytes32 deliveryHash, bytes32 evidenceHash)",
  "function agreements(uint256) view returns (address maker, address taker, address token, address feeRecipient, uint128 collateral, uint64 acceptBy, uint64 settlementBy, uint16 feeBpsSnapshot, uint16 makerDeclinePayoutBps, uint16 makerTimeoutPayoutBps, uint8 state, bytes32 termsHash, bytes32 metadataHash)",
  "function socialOffers(uint256) view returns (address seller, bytes32 sourceIdentityHash, bytes32 metadataHash, uint32 capacity, uint32 reserved, uint64 expiresAt, uint8 proofType, bool isActive)",
  "function allowedToken(address) view returns (bool)",
  "function defaultFeeBps() view returns (uint16)",
  "function paused() view returns (bool)",
  "function roleHolder(uint8) view returns (address)",
  "function createBounty(address token, uint128 reward, uint64 acceptBy, uint64 dueAt, uint64 reviewBy, bytes32 termsHash, bytes32 metadataHash) returns (uint256 id)",
  "function acceptBounty(uint256 id)",
  "function submitBounty(uint256 id, bytes32 deliveryHash)",
  "function approveBounty(uint256 id)",
  "function disputeBounty(uint256 id)",
  "function cancelUnacceptedBounty(uint256 id)",
  "function expireUnacceptedBounty(uint256 id)",
  "function timeoutAcceptedBounty(uint256 id)",
  "function timeoutSubmittedBounty(uint256 id)",
  "function openRetentionCase(uint256 id, bytes32 evidenceHash)",
  "function releaseRetentionBond(uint256 id)",
  "function createAgreement(address token, address taker, uint128 collateral, uint64 acceptBy, uint64 settlementBy, uint16 makerDeclinePayoutBps, uint16 makerTimeoutPayoutBps, bytes32 termsHash, bytes32 metadataHash) returns (uint256 id)",
  "function acceptAgreement(uint256 id)",
  "function declineAgreement(uint256 id)",
  "function disputeAgreement(uint256 id)",
  "function cancelUnacceptedAgreement(uint256 id)",
  "function expireUnacceptedAgreement(uint256 id)",
  "function timeoutAgreement(uint256 id)",
  "event BountyCreated(uint256 indexed id, uint8 indexed kind, address indexed requester, address token, uint256 reward, uint256 retentionBond, uint64 acceptBy, uint64 dueAt, uint64 reviewBy, bytes32 termsHash, bytes32 metadataHash, bytes32 targetActionHash, uint256 offerId, uint16 feeBpsSnapshot, address feeRecipient)",
  "event AgreementCreated(uint256 indexed id, address indexed maker, address indexed taker, address token, uint256 collateral, uint64 acceptBy, uint64 settlementBy, uint16 makerDeclinePayoutBps, uint16 makerTimeoutPayoutBps, bytes32 termsHash, bytes32 metadataHash, uint16 feeBpsSnapshot, address feeRecipient)",
]);

/** BountyState in contracts/src/HankaMarketV2.sol, by index. */
export const ARC_BOUNTY_STATES = ["None", "Open", "Accepted", "Submitted", "Paid", "RetentionActive", "RetentionCase", "Disputed", "Settled", "Cancelled", "Expired"] as const;
/** AgreementState in contracts/src/HankaMarketV2.sol, by index. */
export const ARC_AGREEMENT_STATES = ["None", "Open", "Funded", "Disputed", "Settled", "Cancelled", "Expired"] as const;
export const ARC_SOCIAL_PROOF_TYPES = ["Vouch", "Slash", "Follow", "Repost", "Comment", "SpaceListener", "SpaceSpeaker", "SpaceContributor", "HankaPoints"] as const;

export const ARC_BOUNTY_STATE = { none: 0, open: 1, accepted: 2, submitted: 3, paid: 4, retentionActive: 5, retentionCase: 6, disputed: 7, settled: 8, cancelled: 9, expired: 10 } as const;
export const ARC_AGREEMENT_STATE = { none: 0, open: 1, funded: 2, disputed: 3, settled: 4, cancelled: 5, expired: 6 } as const;

export type ArcBounty = {
  id: bigint;
  requester: Address;
  taker: Address;
  token: Address;
  tokenDecimals: number;
  tokenSymbol: string;
  reward: bigint;
  retentionBond: bigint;
  acceptBy: bigint;
  dueAt: bigint;
  reviewBy: bigint;
  retentionEndsAt: bigint;
  feeBpsSnapshot: number;
  proofType: number;
  kind: number;
  state: number;
  offerId: bigint;
  termsHash: Hex;
  metadataHash: Hex;
  deliveryHash: Hex;
};

export type ArcAgreement = {
  id: bigint;
  maker: Address;
  taker: Address;
  token: Address;
  tokenDecimals: number;
  tokenSymbol: string;
  collateral: bigint;
  acceptBy: bigint;
  settlementBy: bigint;
  feeBpsSnapshot: number;
  makerDeclinePayoutBps: number;
  makerTimeoutPayoutBps: number;
  state: number;
  termsHash: Hex;
  metadataHash: Hex;
};

export type ArcMarketSnapshot = {
  bounties: ArcBounty[];
  agreements: ArcAgreement[];
  paused: boolean;
  defaultFeeBps: number;
  scannedAt: number;
};

export type ArcWalletDashboard = {
  bounties: ArcBounty[];
  agreements: ArcAgreement[];
  requested: ArcBounty[];
  claimed: ArcBounty[];
};

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
export const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000" as Hex;

export const arcBountyStateLabel = (state: number) => ARC_BOUNTY_STATES[state] ?? `State ${state}`;
export const arcAgreementStateLabel = (state: number) => ARC_AGREEMENT_STATES[state] ?? `State ${state}`;
export const arcProofTypeLabel = (proofType: number) => ARC_SOCIAL_PROOF_TYPES[proofType] ?? `Type ${proofType}`;
export const sameAddress = (left?: string | null, right?: string | null) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Resolves the market contract, preferring an explicit build-time value and
 * falling back to the reviewed deployment. An unset environment variable used
 * to leave the whole market dark; now it only loses the override.
 *
 * These reads are written as full `import.meta.env.NAME` expressions on purpose:
 * Vite substitutes them statically at build time, so destructuring or indexing
 * the env object would silently discard the override.
 */
export function getArcContractAddress(): Address | null {
  const candidates = [
    import.meta.env.VITE_HANKA_MARKET_V2_TESTNET_ADDRESS,
    import.meta.env.VITE_ARC_TESTNET_ESCROW_ADDRESS,
    HANKA_MARKET_V2_TESTNET_ADDRESS,
  ];
  for (const candidate of candidates) {
    const value = typeof candidate === "string" ? candidate.trim() : "";
    if (value && isAddress(value)) return value as Address;
  }
  return null;
}

/** Retained for older call sites; the V2 market contract is the escrow. */
export const getArcEscrowAddress = getArcContractAddress;

export function getArcRpcUrls(): string[] {
  const origin = typeof window === "undefined" ? null : window.location.origin;
  const configured = import.meta.env.VITE_ARC_TESTNET_RPC_URLS;
  return resolveArcRpcUrls({ origin, configured: typeof configured === "string" ? configured : null });
}

let cachedPublicClient: PublicClient | null = null;

/**
 * A public client that fails over between endpoints instead of surfacing the
 * first `fetch` rejection. Reads are the app's heartbeat: one unreachable
 * endpoint should cost a few hundred milliseconds, not the whole market.
 */
export function arcPublicClient(): PublicClient {
  if (cachedPublicClient) return cachedPublicClient;
  const transports = getArcRpcUrls().map(url => http(url, { timeout: 12_000, retryCount: 1, retryDelay: 250 }));
  cachedPublicClient = createPublicClient({
    chain: hankaArcTestnet,
    transport: transports.length > 1 ? fallback(transports, { retryCount: 1 }) : transports[0] ?? http(),
  }) as PublicClient;
  return cachedPublicClient;
}

/** Drops the memoised client so a settings change takes effect without a reload. */
export function resetArcPublicClient() {
  cachedPublicClient = null;
}

function contractOrThrow(): Address {
  const address = getArcContractAddress();
  if (!address) throw new Error("The HANKA market contract address is not configured.");
  return address;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  Unauthorized: "This wallet is not a party to that record.",
  InvalidAddress: "That address cannot be used for this action.",
  InvalidToken: "That token is not allowlisted by the market contract.",
  InvalidAmount: "Enter an amount above zero.",
  InvalidDeadline: "Deadlines must run forward: accept, then due, then review.",
  InvalidState: "The record has already moved past this action.",
  InvalidCommitment: "Some required commitment details are missing.",
  DeadlinePassed: "That deadline has already passed.",
  DeadlineNotReached: "That deadline has not been reached yet.",
  ProtocolPaused: "The market contract is paused.",
  TransferFailed: "The token transfer failed. Check your balance and approval.",
  SourceRestricted: "That source is restricted by the contract.",
  DuplicateSourceAction: "This source has already completed that action.",
  SourceRequirementsNotMet: "Your attested metrics are below this bounty's minimums.",
  OfferUnavailable: "That social offer is no longer available.",
  InvalidPayout: "The payout split does not match the escrowed amount.",
  NativeValueNotAccepted: "This contract settles in ERC-20 tokens only.",
};

/**
 * Turns a viem/provider error into one sentence a user can act on.
 *
 * The market previously toasted the raw viem error, so an unreachable RPC
 * filled the screen with request bodies, call arguments and doc links. The
 * detail still reaches the console for debugging.
 */
export function describeArcError(error: unknown): string {
  if (!error) return "Something went wrong.";
  const anyError = error as { code?: number | string; shortMessage?: string; details?: string; message?: string; cause?: unknown; name?: string };
  const code = anyError.code ?? (anyError.cause as { code?: number })?.code;
  if (code === 4001 || code === "ACTION_REJECTED") return "You rejected the request in your wallet.";
  if (code === -32002) return "Your wallet already has a pending request. Open it to continue.";

  const haystack = [anyError.shortMessage, anyError.details, anyError.message, String((anyError.cause as Error | undefined)?.message ?? "")].join(" ");
  for (const [name, message] of Object.entries(CONTRACT_ERROR_MESSAGES)) {
    if (haystack.includes(name)) return message;
  }
  if (/Failed to fetch|fetch failed|NetworkError|ECONNREFUSED|ETIMEDOUT|HTTP request failed/i.test(haystack)) {
    return "Could not reach an Arc Testnet RPC endpoint. Check your connection and try again.";
  }
  if (/insufficient funds/i.test(haystack)) return "This wallet does not have enough Arc Testnet USDC for gas and the amount.";
  if (/user rejected|denied transaction/i.test(haystack)) return "You rejected the request in your wallet.";
  if (/chain.*mismatch|does not match the target chain/i.test(haystack)) return "Your wallet is on the wrong network. Switch to Arc Testnet.";
  if (anyError.shortMessage) return anyError.shortMessage;
  if (anyError.message) return anyError.message.split("\n")[0];
  return "Something went wrong.";
}

// ---------------------------------------------------------------------------
// Wallet discovery and connection
// ---------------------------------------------------------------------------

const browserProvider = () =>
  typeof window === "undefined" ? undefined : (window as Window & { ethereum?: ArcEip1193Provider }).ethereum;

const injectedName = (provider: ArcEip1193Provider) => {
  if (provider.isRabby) return "Rabby";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isTrust) return "Trust Wallet";
  if (provider.isRainbow) return "Rainbow";
  if (provider.isPhantom) return "Phantom";
  if (provider.isMetaMask) return "MetaMask";
  return "Browser wallet";
};

const dedupeProviders = (providers: ArcWalletProvider[]) => {
  const seen = new Set<ArcEip1193Provider>();
  return providers.filter(item => {
    if (seen.has(item.provider)) return false;
    seen.add(item.provider);
    return true;
  });
};

/**
 * Discovers wallets through EIP-6963, then falls back to legacy injection.
 *
 * The previous build only read `window.ethereum.providers` and then filtered
 * the result down to MetaMask and Phantom, so every other wallet the user had
 * installed was invisible. Nothing is sent to a provider until one is chosen.
 */
export async function listArcWalletProviders(): Promise<ArcWalletProvider[]> {
  if (typeof window === "undefined") return [];
  const announced = await new Promise<ArcWalletProvider[]>(resolve => {
    const discovered: ArcWalletProvider[] = [];
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (!detail?.provider?.request || !detail.info?.uuid) return;
      discovered.push({
        id: detail.info.uuid,
        name: detail.info.name || "EVM wallet",
        icon: detail.info.icon,
        rdns: detail.info.rdns,
        provider: detail.provider,
      });
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      resolve(discovered);
    }, 180);
  });

  const injected = browserProvider();
  const candidates = injected ? (injected.providers?.length ? injected.providers : [injected]) : [];
  const fallbackProviders = candidates.map((provider, index) => ({
    id: `injected-${index}`,
    name: injectedName(provider),
    provider,
  }));
  return dedupeProviders([...announced, ...fallbackProviders]);
}

export const hasInjectedArcWallet = () => Boolean(browserProvider());

/** Rough mobile detection, used only to decide which fallbacks to offer. */
export const isMobileBrowser = () =>
  typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

/**
 * Deep links that reopen the current page inside a wallet's own browser.
 *
 * On a mobile browser there is no extension to inject a provider, so the old
 * "Open MetaMask or Phantom EVM first" error was a dead end. These links are
 * the supported way back into a signing context.
 */
export function arcWalletDeepLinks(): Array<{ id: string; name: string; url: string }> {
  if (typeof window === "undefined") return [];
  const url = window.location.href;
  const host = `${window.location.host}${window.location.pathname}${window.location.search}`;
  return [
    { id: "metamask", name: "MetaMask", url: `https://metamask.app.link/dapp/${host}` },
    { id: "coinbase", name: "Coinbase Wallet", url: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(url)}` },
    { id: "trust", name: "Trust Wallet", url: `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(url)}` },
    { id: "rainbow", name: "Rainbow", url: `https://rnbwapp.com/dapp?url=${encodeURIComponent(url)}` },
  ];
}

function providerOrThrow(selected?: ArcEip1193Provider): ArcEip1193Provider {
  if (selected) return selected;
  const provider = browserProvider();
  if (!provider) {
    throw new Error(
      isMobileBrowser()
        ? "No EVM wallet is available in this browser. Open HANKA inside your wallet app to connect."
        : "No EVM wallet found. Install MetaMask, Rabby, Coinbase Wallet, or another EIP-1193 wallet.",
    );
  }
  const candidates = provider.providers?.length ? provider.providers : [provider];
  return (
    candidates.find(candidate => candidate.isRabby) ??
    candidates.find(candidate => candidate.isMetaMask && !candidate.isCoinbaseWallet) ??
    candidates.find(candidate => candidate.isCoinbaseWallet) ??
    candidates[0]
  );
}

const isUnknownChainError = (error: unknown) => {
  const anyError = error as { code?: number; cause?: { code?: number }; message?: string; shortMessage?: string };
  if (anyError?.code === 4902 || anyError?.cause?.code === 4902) return true;
  // Several wallets report an unknown chain as a generic internal error, so the
  // message is the only reliable signal.
  return /unrecognized chain|unknown chain|chain .* not (?:been )?added|addEthereumChain/i.test(
    `${anyError?.message ?? ""} ${anyError?.shortMessage ?? ""}`,
  );
};

/**
 * Puts the wallet on Arc Testnet, adding the network when the wallet has never
 * seen it. Switching alone fails on a fresh wallet, which is the single most
 * common first-run failure.
 */
export async function ensureArcChain(provider?: ArcEip1193Provider): Promise<WalletClient> {
  const walletClient = createWalletClient({ chain: hankaArcTestnet, transport: custom(providerOrThrow(provider)) });
  const currentChainId = await walletClient.getChainId();
  if (currentChainId === hankaArcTestnet.id) return walletClient;
  try {
    await walletClient.switchChain({ id: hankaArcTestnet.id });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;
    await walletClient.addChain({ chain: hankaArcTestnet });
    await walletClient.switchChain({ id: hankaArcTestnet.id });
  }
  return walletClient;
}

export async function connectArcWallet(selected?: ArcEip1193Provider): Promise<ArcWalletState> {
  const provider = providerOrThrow(selected);
  const walletClient = await ensureArcChain(provider);
  const [address] = await walletClient.requestAddresses();
  if (!address) throw new Error("The wallet did not return an EVM account.");
  return { address, chainId: await walletClient.getChainId() };
}

/**
 * Restores a session without prompting. `eth_accounts` returns the already
 * authorised accounts, so a refresh keeps the wallet connected instead of
 * showing a signature prompt the user did not ask for.
 */
export async function reconnectArcWallet(selected?: ArcEip1193Provider): Promise<ArcWalletState | null> {
  const provider = selected ?? browserProvider();
  if (!provider) return null;
  try {
    const walletClient = createWalletClient({ chain: hankaArcTestnet, transport: custom(provider) });
    const [address] = await walletClient.getAddresses();
    if (!address) return null;
    return { address, chainId: await walletClient.getChainId() };
  } catch {
    return null;
  }
}

/** Subscribes to account and chain changes; returns an unsubscribe function. */
export function watchArcWallet(
  provider: ArcEip1193Provider | undefined,
  handlers: { onAccountsChanged?: (accounts: Address[]) => void; onChainChanged?: (chainId: number) => void },
): () => void {
  const target = provider ?? browserProvider();
  if (!target?.on || !target.removeListener) return () => {};
  const onAccounts = (...args: never[]) => handlers.onAccountsChanged?.((args[0] ?? []) as Address[]);
  const onChain = (...args: never[]) => handlers.onChainChanged?.(Number(args[0] ?? 0));
  target.on("accountsChanged", onAccounts);
  target.on("chainChanged", onChain);
  return () => {
    target.removeListener?.("accountsChanged", onAccounts);
    target.removeListener?.("chainChanged", onChain);
  };
}

async function walletAndAccount(selected?: ArcEip1193Provider) {
  const provider = providerOrThrow(selected);
  const walletClient = await ensureArcChain(provider);
  const [existing] = await walletClient.getAddresses();
  const account = existing ?? (await walletClient.requestAddresses())[0];
  if (!account) throw new Error("Connect an EVM wallet before approving a transaction.");
  return { walletClient, account };
}

export async function signArcWalletMessage(message: string, selected?: ArcEip1193Provider): Promise<Hex> {
  const { walletClient, account } = await walletAndAccount(selected);
  return walletClient.signMessage({ account, message });
}

// ---------------------------------------------------------------------------
// Amounts and commitments
// ---------------------------------------------------------------------------

export async function getArcTokenDecimals(token: Address): Promise<number> {
  return Number(await arcPublicClient().readContract({ address: token, abi: erc20Abi, functionName: "decimals" }));
}

export async function getArcTokenBalance(token: Address, owner: Address): Promise<bigint> {
  return arcPublicClient().readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [owner] });
}

export const toTokenUnits = (value: string, decimals: number): bigint => {
  const trimmed = value.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error("Enter a valid positive token amount.");
  const [, fraction = ""] = trimmed.split(".");
  if (fraction.length > decimals) throw new Error(`This token supports at most ${decimals} decimal places.`);
  const units = parseUnits(trimmed, decimals);
  if (units <= BigInt(0)) throw new Error("Enter an amount above zero.");
  return units;
};

export const hashArcTerms = (terms: string): Hex => {
  const normalized = terms.trim().replace(/\s+/g, " ");
  if (normalized.length < 8) throw new Error("Describe the agreement in at least eight characters before signing.");
  return keccak256(stringToHex(normalized));
};

/**
 * The contract requires a non-zero metadata commitment. Hashing the same text
 * twice would make the two commitments interchangeable, so the metadata hash is
 * domain-separated from the terms hash.
 */
export const hashArcMetadata = (metadata: string): Hex => keccak256(stringToHex(`hanka-market-v2:metadata:${metadata.trim().replace(/\s+/g, " ")}`));

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Testnet-scale discovery cap. A production market needs an event indexer. */
const MAX_SCANNED_RECORDS = 300;
const SCAN_CONCURRENCY = 8;

const recordIds = (count: bigint) =>
  Array.from({ length: Math.min(Number(count), MAX_SCANNED_RECORDS) }, (_, index) => BigInt(index + 1));

/**
 * Runs `worker` over `items` a few at a time. Firing 300 `eth_call`s at once
 * gets a public endpoint to rate-limit the browser, which reads as an outage.
 */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

type TokenMeta = { decimals: number; symbol: string };

async function readTokenMetadata(tokens: readonly Address[]): Promise<Map<string, TokenMeta>> {
  const unique = Array.from(new Set(tokens.filter(token => token && token !== ZERO_ADDRESS).map(token => token.toLowerCase())));
  const client = arcPublicClient();
  const entries = await mapWithConcurrency(unique, SCAN_CONCURRENCY, async token => {
    const known = ARC_TESTNET_TOKENS.find(item => item.address.toLowerCase() === token);
    try {
      const [decimals, symbol] = await Promise.all([
        client.readContract({ address: token as Address, abi: erc20Abi, functionName: "decimals" }),
        client.readContract({ address: token as Address, abi: erc20Abi, functionName: "symbol" }).catch(() => known?.symbol ?? "TOKEN"),
      ]);
      return [token, { decimals: Number(decimals), symbol: String(symbol) }] as const;
    } catch {
      return [token, { decimals: known?.decimals ?? 6, symbol: known?.symbol ?? "TOKEN" }] as const;
    }
  });
  return new Map(entries);
}

type BountyTuple = readonly [
  Address, Address, Address, Address, bigint, bigint, bigint, bigint, bigint, bigint,
  bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, number, number,
  number, boolean, boolean, bigint, Hex, Hex, Hex, Hex, Hex, Hex,
];

type AgreementTuple = readonly [Address, Address, Address, Address, bigint, bigint, bigint, number, number, number, number, Hex, Hex];

const toBounty = (id: bigint, value: BountyTuple, tokens: Map<string, TokenMeta>): ArcBounty => {
  const meta = tokens.get(value[2].toLowerCase());
  return {
    id,
    requester: value[0],
    taker: value[1],
    token: value[2],
    tokenDecimals: meta?.decimals ?? 6,
    tokenSymbol: meta?.symbol ?? "TOKEN",
    reward: value[4],
    retentionBond: value[5],
    acceptBy: value[6],
    dueAt: value[7],
    reviewBy: value[8],
    retentionEndsAt: value[10],
    feeBpsSnapshot: Number(value[17]),
    proofType: Number(value[18]),
    kind: Number(value[19]),
    state: Number(value[20]),
    offerId: value[23],
    termsHash: value[24],
    metadataHash: value[25],
    deliveryHash: value[28],
  };
};

const toAgreement = (id: bigint, value: AgreementTuple, tokens: Map<string, TokenMeta>): ArcAgreement => {
  const meta = tokens.get(value[2].toLowerCase());
  return {
    id,
    maker: value[0],
    taker: value[1],
    token: value[2],
    tokenDecimals: meta?.decimals ?? 6,
    tokenSymbol: meta?.symbol ?? "TOKEN",
    collateral: value[4],
    acceptBy: value[5],
    settlementBy: value[6],
    feeBpsSnapshot: Number(value[7]),
    makerDeclinePayoutBps: Number(value[8]),
    makerTimeoutPayoutBps: Number(value[9]),
    state: Number(value[10]),
    termsHash: value[11],
    metadataHash: value[12],
  };
};

/**
 * Reads every bounty and agreement the contract holds, newest first.
 *
 * The contract stores commitment hashes rather than listing text, so callers
 * must render the hash as a reference and never invent a description for it.
 */
export async function getArcMarketSnapshot(): Promise<ArcMarketSnapshot> {
  const address = contractOrThrow();
  const client = arcPublicClient();
  const [bountyCount, agreementCount, paused, defaultFeeBps] = await Promise.all([
    client.readContract({ address, abi: hankaMarketV2Abi, functionName: "bountyCount" }),
    client.readContract({ address, abi: hankaMarketV2Abi, functionName: "agreementCount" }),
    client.readContract({ address, abi: hankaMarketV2Abi, functionName: "paused" }),
    client.readContract({ address, abi: hankaMarketV2Abi, functionName: "defaultFeeBps" }),
  ]);

  const [bountyValues, agreementValues] = await Promise.all([
    mapWithConcurrency(recordIds(bountyCount), SCAN_CONCURRENCY, async id => ({
      id,
      value: (await client.readContract({ address, abi: hankaMarketV2Abi, functionName: "bounties", args: [id] })) as BountyTuple,
    })),
    mapWithConcurrency(recordIds(agreementCount), SCAN_CONCURRENCY, async id => ({
      id,
      value: (await client.readContract({ address, abi: hankaMarketV2Abi, functionName: "agreements", args: [id] })) as AgreementTuple,
    })),
  ]);

  const tokens = await readTokenMetadata([
    ...bountyValues.map(item => item.value[2]),
    ...agreementValues.map(item => item.value[2]),
  ]);

  return {
    bounties: bountyValues.map(({ id, value }) => toBounty(id, value, tokens)).sort((a, b) => Number(b.id - a.id)),
    agreements: agreementValues.map(({ id, value }) => toAgreement(id, value, tokens)).sort((a, b) => Number(b.id - a.id)),
    paused: Boolean(paused),
    defaultFeeBps: Number(defaultFeeBps),
    scannedAt: Date.now(),
  };
}

/** Open, fundable bounties only. No sample records are invented. */
export async function getArcOpenBounties(): Promise<ArcBounty[]> {
  const snapshot = await getArcMarketSnapshot();
  return snapshot.bounties.filter(record => record.state === ARC_BOUNTY_STATE.open);
}

/** Every record the connected wallet is a party to, on either side. */
export async function getArcWalletDashboard(wallet: Address, snapshot?: ArcMarketSnapshot): Promise<ArcWalletDashboard> {
  const data = snapshot ?? (await getArcMarketSnapshot());
  const bounties = data.bounties.filter(record => sameAddress(record.requester, wallet) || sameAddress(record.taker, wallet));
  const agreements = data.agreements.filter(record => sameAddress(record.maker, wallet) || sameAddress(record.taker, wallet));
  return {
    bounties,
    agreements,
    requested: bounties.filter(record => sameAddress(record.requester, wallet)),
    claimed: bounties.filter(record => sameAddress(record.taker, wallet)),
  };
}

/** The subset of the token catalogue the deployed contract actually accepts. */
export async function getArcAllowedTokens(): Promise<Array<(typeof ARC_TESTNET_TOKENS)[number]>> {
  const address = contractOrThrow();
  const client = arcPublicClient();
  const results = await mapWithConcurrency(ARC_TESTNET_TOKENS, 3, async token => {
    try {
      const allowed = await client.readContract({ address, abi: hankaMarketV2Abi, functionName: "allowedToken", args: [token.address as Address] });
      return allowed ? token : null;
    } catch {
      return null;
    }
  });
  return results.filter((token): token is (typeof ARC_TESTNET_TOKENS)[number] => token !== null);
}

/** Reads the arbiter so dispute copy can name the configured resolver. */
export async function getArcArbiter(): Promise<Address | null> {
  try {
    const arbiter = await arcPublicClient().readContract({
      address: contractOrThrow(),
      abi: hankaMarketV2Abi,
      functionName: "roleHolder",
      args: [1],
    });
    return arbiter === ZERO_ADDRESS ? null : arbiter;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Approves only the shortfall, and only when the existing allowance is short. */
async function ensureAllowance(token: Address, amount: bigint, account: Address, walletClient: WalletClient) {
  const spender = contractOrThrow();
  const client = arcPublicClient();
  const current = await client.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [account, spender] });
  if (current >= amount) return;
  const hash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: "approve",
    args: [spender, amount],
    account,
    chain: hankaArcTestnet,
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The token approval did not complete.");
}

type MarketFunction =
  | "acceptBounty" | "submitBounty" | "approveBounty" | "disputeBounty" | "cancelUnacceptedBounty"
  | "expireUnacceptedBounty" | "timeoutAcceptedBounty" | "timeoutSubmittedBounty" | "openRetentionCase"
  | "releaseRetentionBond" | "acceptAgreement" | "declineAgreement" | "disputeAgreement"
  | "cancelUnacceptedAgreement" | "expireUnacceptedAgreement" | "timeoutAgreement";

/**
 * Simulates before signing so a doomed transaction surfaces the contract's own
 * error instead of costing the user a failed transaction and a wallet prompt.
 */
async function writeMarket(functionName: MarketFunction, args: readonly unknown[], selected?: ArcEip1193Provider): Promise<Hex> {
  const address = contractOrThrow();
  const { walletClient, account } = await walletAndAccount(selected);
  const { request } = await arcPublicClient().simulateContract({
    address,
    abi: hankaMarketV2Abi,
    functionName: functionName as never,
    args: args as never,
    account,
  });
  return walletClient.writeContract({ ...request, account, chain: hankaArcTestnet });
}

export type ArcCreatedRecord = { hash: Hex; id: bigint | null; termsHash: Hex; metadataHash: Hex };

export type ArcBountyInput = {
  token: Address;
  reward: bigint;
  acceptBy: number;
  dueAt: number;
  reviewBy: number;
  terms: string;
  metadata: string;
};

/** Funds a general bounty: approve the exact reward, then escrow it. */
export async function createArcBounty(input: ArcBountyInput, selected?: ArcEip1193Provider): Promise<ArcCreatedRecord> {
  const address = contractOrThrow();
  const { walletClient, account } = await walletAndAccount(selected);
  const termsHash = hashArcTerms(input.terms);
  const metadataHash = hashArcMetadata(input.metadata);
  await ensureAllowance(input.token, input.reward, account, walletClient);
  const client = arcPublicClient();
  const { request } = await client.simulateContract({
    address,
    abi: hankaMarketV2Abi,
    functionName: "createBounty",
    args: [input.token, input.reward, BigInt(input.acceptBy), BigInt(input.dueAt), BigInt(input.reviewBy), termsHash, metadataHash],
    account,
  });
  const hash = await walletClient.writeContract({ ...request, account, chain: hankaArcTestnet });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The bounty funding transaction did not complete.");
  const created = parseEventLogs({ abi: hankaMarketV2Abi, logs: receipt.logs, eventName: "BountyCreated", strict: false })
    .find(event => sameAddress(event.address, address));
  return { hash, id: typeof created?.args.id === "bigint" ? created.args.id : null, termsHash, metadataHash };
}

export type ArcAgreementInput = {
  token: Address;
  taker: Address;
  collateral: bigint;
  acceptBy: number;
  settlementBy: number;
  makerDeclinePayoutBps: number;
  makerTimeoutPayoutBps: number;
  terms: string;
  metadata: string;
};

/** Opens a named, equal-collateral agreement and escrows the maker's side. */
export async function createArcAgreement(input: ArcAgreementInput, selected?: ArcEip1193Provider): Promise<ArcCreatedRecord> {
  const address = contractOrThrow();
  if (!isAddress(input.taker)) throw new Error("Enter a valid counterparty EVM address.");
  const { walletClient, account } = await walletAndAccount(selected);
  if (sameAddress(input.taker, account)) throw new Error("The counterparty must be a different wallet.");
  const termsHash = hashArcTerms(input.terms);
  const metadataHash = hashArcMetadata(input.metadata);
  await ensureAllowance(input.token, input.collateral, account, walletClient);
  const client = arcPublicClient();
  const { request } = await client.simulateContract({
    address,
    abi: hankaMarketV2Abi,
    functionName: "createAgreement",
    args: [
      input.token,
      input.taker,
      input.collateral,
      BigInt(input.acceptBy),
      BigInt(input.settlementBy),
      input.makerDeclinePayoutBps,
      input.makerTimeoutPayoutBps,
      termsHash,
      metadataHash,
    ],
    account,
  });
  const hash = await walletClient.writeContract({ ...request, account, chain: hankaArcTestnet });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The agreement funding transaction did not complete.");
  const created = parseEventLogs({ abi: hankaMarketV2Abi, logs: receipt.logs, eventName: "AgreementCreated", strict: false })
    .find(event => sameAddress(event.address, address));
  return { hash, id: typeof created?.args.id === "bigint" ? created.args.id : null, termsHash, metadataHash };
}

/** The taker's collateral is pulled on acceptance, so it needs an approval. */
export async function acceptArcAgreement(id: bigint, token: Address, collateral: bigint, selected?: ArcEip1193Provider): Promise<Hex> {
  const { walletClient, account } = await walletAndAccount(selected);
  await ensureAllowance(token, collateral, account, walletClient);
  return writeMarket("acceptAgreement", [id], selected);
}

export const acceptArcBounty = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("acceptBounty", [id], selected);
export const submitArcBounty = (id: bigint, delivery: string, selected?: ArcEip1193Provider) =>
  writeMarket("submitBounty", [id, hashArcTerms(delivery)], selected);
export const approveArcBounty = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("approveBounty", [id], selected);
export const disputeArcBounty = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("disputeBounty", [id], selected);
export const cancelArcBounty = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("cancelUnacceptedBounty", [id], selected);
export const expireArcBounty = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("expireUnacceptedBounty", [id], selected);
export const timeoutArcAcceptedBounty = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("timeoutAcceptedBounty", [id], selected);
export const timeoutArcSubmittedBounty = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("timeoutSubmittedBounty", [id], selected);
export const openArcRetentionCase = (id: bigint, evidence: string, selected?: ArcEip1193Provider) =>
  writeMarket("openRetentionCase", [id, hashArcTerms(evidence)], selected);
export const releaseArcRetentionBond = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("releaseRetentionBond", [id], selected);
export const declineArcAgreement = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("declineAgreement", [id], selected);
export const disputeArcAgreement = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("disputeAgreement", [id], selected);
export const cancelArcAgreement = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("cancelUnacceptedAgreement", [id], selected);
export const expireArcAgreement = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("expireUnacceptedAgreement", [id], selected);
export const timeoutArcAgreement = (id: bigint, selected?: ArcEip1193Provider) => writeMarket("timeoutAgreement", [id], selected);

export { ARC_TESTNET_CHAIN_ID_HEX };
