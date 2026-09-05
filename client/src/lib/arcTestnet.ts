import { createPublicClient, createWalletClient, custom, defineChain, http, isAddress, keccak256, parseAbi, parseEventLogs, parseUnits, stringToHex, type Address, type Hex } from "viem";

export type ArcEip1193Provider = Parameters<typeof custom>[0] & { isMetaMask?: boolean; isPhantom?: boolean; providers?: ArcEip1193Provider[] };
export type ArcWalletProvider = { id: string; name: string; provider: ArcEip1193Provider };
export type ArcWalletState = { address: Address; chainId: number };

export const hankaArcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  blockExplorers: { default: { name: "ArcScan", url: "https://testnet.arcscan.app" } },
  testnet: true,
});

export const ARC_TESTNET_TOKENS = [{ symbol: "USDC", name: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 }] as const satisfies ReadonlyArray<{ symbol: string; name: string; address: Address; decimals: number }>;
export type ArcTokenSymbol = (typeof ARC_TESTNET_TOKENS)[number]["symbol"];

const erc20Abi = parseAbi(["function approve(address spender, uint256 amount) returns (bool)", "function decimals() view returns (uint8)"]);
const marketAbi = parseAbi([
  "function listJob(address token, uint128 reward, uint64 listDeadline, uint64 dueAt, bytes32 termsHash) returns (uint256)",
  "function createBounty(address token, uint128 reward, uint64 listDeadline, uint64 dueAt, bytes32 termsHash) returns (uint256)",
  "function createTask(address token, uint128 reward, uint64 acceptDeadline, uint64 dueAt, bytes32 termsHash) returns (uint256)",
  "function createSocialBounty(address token, uint128 reward, uint64 listDeadline, uint64 dueAt, bytes32 termsHash) returns (uint256)",
  "function acceptSocialBounty(uint256 id)", "function acceptTask(uint256 id)", "function submitJob(uint256 id, bytes32 proofHash)", "function submitTask(uint256 id, bytes32 deliveryHash)", "function approveTask(uint256 id)", "function awardJob(uint256 id, address[] winners, uint128[] amounts)", "function disputeJob(uint256 id)", "function cancelJob(uint256 id)", "function refundUnsubmittedJob(uint256 id)",
  "function jobCount() view returns (uint256)", "function jobs(uint256 id) view returns (address buyer, address token, uint128 reward, uint64 listDeadline, uint64 dueAt, bytes32 termsHash, uint8 state, uint8 submitterCount)", "function jobSubmitterAt(uint256 id, uint8 index) view returns (address)",
  "function listPointSale(address token, address buyer, uint128 price, uint64 listDeadline, uint64 settleDeadline, bytes32 termsHash) returns (uint256)", "function buyPointSale(uint256 id)", "function markPointSaleDelivered(uint256 id)", "function confirmPointSaleDelivery(uint256 id)", "function cancelPointSale(uint256 id)", "function disputePointSale(uint256 id)", "function pointSaleCount() view returns (uint256)", "function pointSales(uint256 id) view returns (address seller, address buyer, address token, uint128 price, uint64 listDeadline, uint64 settleDeadline, bytes32 termsHash, bool sellerDelivered, bool buyerConfirmed, uint8 state)",
  "event JobListed(uint256 indexed id, address indexed buyer, address token, uint256 reward, uint64 listDeadline, uint64 dueAt, bytes32 termsHash)", "event PointSaleListed(uint256 indexed id, address indexed seller, address buyer, address token, uint256 price, uint64 listDeadline, uint64 settleDeadline, bytes32 termsHash)",
]);

export type ArcJob = { id: bigint; buyer: Address; token: Address; reward: bigint; listDeadline: bigint; dueAt: bigint; termsHash: Hex; state: number; submitterCount: number; submitter?: Address };
export type ArcPointSale = { id: bigint; seller: Address; buyer: Address; token: Address; price: bigint; listDeadline: bigint; settleDeadline: bigint; termsHash: Hex; sellerDelivered: boolean; buyerConfirmed: boolean; state: number };
const zeroAddress = "0x0000000000000000000000000000000000000000" as Address;
const browserProvider = () => typeof window === "undefined" ? undefined : (window as Window & { ethereum?: ArcEip1193Provider }).ethereum;

export const getArcEscrowAddress = (): Address | null => { const value = import.meta.env.VITE_HANKA_MARKET_V2_TESTNET_ADDRESS?.trim(); return value && isAddress(value) ? value : null; };
export const arcExplorerTx = (hash: Hex) => `https://testnet.arcscan.app/tx/${hash}`;
export const hashArcTerms = (value: string): Hex => { const normalized = value.trim().replace(/\s+/g, " "); if (normalized.length < 8) throw new Error("Add at least eight characters of terms."); return keccak256(stringToHex(normalized)); };
export const toTokenUnits = (value: string, decimals: number) => { if (!/^\d+(\.\d+)?$/.test(value.trim())) throw new Error("Enter a valid token amount."); const units = parseUnits(value.trim(), decimals); if (units <= BigInt(0)) throw new Error("Amount must be above zero."); return units; };

const providerName = (provider: ArcEip1193Provider) => provider.isMetaMask ? "MetaMask" : provider.isPhantom ? "Phantom" : "EVM wallet";
export async function listArcWalletProviders(): Promise<ArcWalletProvider[]> { const provider = browserProvider(); if (!provider) return []; const candidates = provider.providers?.length ? provider.providers : [provider]; return candidates.filter(item => item.isMetaMask || item.isPhantom).map((item, index) => ({ id: `${providerName(item)}-${index}`, name: providerName(item), provider: item })); }
async function walletAndAccount(selected?: ArcEip1193Provider) { const provider = selected ?? browserProvider(); if (!provider) throw new Error("Open MetaMask or Phantom EVM first."); const wallet = createWalletClient({ chain: hankaArcTestnet, transport: custom(provider) }); const chainId = await wallet.getChainId(); if (chainId !== hankaArcTestnet.id) { await wallet.switchChain({ id: hankaArcTestnet.id }); } const [account] = await wallet.requestAddresses(); if (!account) throw new Error("Connect an EVM account first."); return { wallet, account }; }
export async function connectArcWallet(selected?: ArcEip1193Provider): Promise<ArcWalletState> { const { wallet, account } = await walletAndAccount(selected); return { address: account, chainId: await wallet.getChainId() }; }
const publicClient = () => createPublicClient({ chain: hankaArcTestnet, transport: http() });
const market = () => { const address = getArcEscrowAddress(); if (!address) throw new Error("The HankaMarketV2 address is not configured."); return address; };
export async function getArcTokenDecimals(token: Address) { return Number(await publicClient().readContract({ address: token, abi: erc20Abi, functionName: "decimals" })); }
async function approve(token: Address, amount: bigint, account: Address, wallet: Awaited<ReturnType<typeof walletAndAccount>>["wallet"]) { const hash = await wallet.writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [market(), amount], account }); await publicClient().waitForTransactionReceipt({ hash }); }
async function write(functionName: string, args: readonly unknown[]) { const { wallet, account } = await walletAndAccount(); return wallet.writeContract({ address: market(), abi: marketAbi, functionName: functionName as never, args: args as never, account }); }

export async function createArcJob(input: { token: Address; amount: bigint; listDeadline: number; dueAt: number; terms: string }) { const { wallet, account } = await walletAndAccount(); await approve(input.token, input.amount, account, wallet); const hash = await wallet.writeContract({ address: market(), abi: marketAbi, functionName: "listJob", args: [input.token, input.amount, BigInt(input.listDeadline), BigInt(input.dueAt), hashArcTerms(input.terms)], account }); return hash; }
export async function createArcPointSale(input: { token: Address; buyer: Address; price: bigint; listDeadline: number; settleDeadline: number; terms: string }) { const { wallet, account } = await walletAndAccount(); await approve(input.token, input.price, account, wallet); return wallet.writeContract({ address: market(), abi: marketAbi, functionName: "listPointSale", args: [input.token, input.buyer, input.price, BigInt(input.listDeadline), BigInt(input.settleDeadline), hashArcTerms(input.terms)], account }); }
export const acceptArcJob = (id: bigint) => write("acceptTask", [id]);
export const submitArcJob = (id: bigint, proof: string) => write("submitJob", [id, hashArcTerms(proof)]);
export const approveArcJob = (id: bigint) => write("approveTask", [id]);
export const disputeArcJob = (id: bigint) => write("disputeJob", [id]);
export const cancelArcJob = (id: bigint) => write("cancelJob", [id]);
export const buyArcPointSale = (id: bigint) => write("buyPointSale", [id]);
export const deliverArcPointSale = (id: bigint) => write("markPointSaleDelivered", [id]);
export const confirmArcPointSale = (id: bigint) => write("confirmPointSaleDelivery", [id]);
export const disputeArcPointSale = (id: bigint) => write("disputePointSale", [id]);

export async function getArcMarketListings() { const client = publicClient(); const address = market(); const [jobCount, saleCount] = await Promise.all([client.readContract({ address, abi: marketAbi, functionName: "jobCount" }), client.readContract({ address, abi: marketAbi, functionName: "pointSaleCount" })]); const jobs = await Promise.all(Array.from({ length: Number(jobCount) }, (_, index) => BigInt(index + 1)).map(async id => { const value = await client.readContract({ address, abi: marketAbi, functionName: "jobs", args: [id] }); const submitter = value[7] > 0 ? await client.readContract({ address, abi: marketAbi, functionName: "jobSubmitterAt", args: [id, 0] }) : undefined; return { id, buyer: value[0], token: value[1], reward: value[2], listDeadline: value[3], dueAt: value[4], termsHash: value[5], state: Number(value[6]), submitterCount: Number(value[7]), submitter } satisfies ArcJob; })); const pointSales = await Promise.all(Array.from({ length: Number(saleCount) }, (_, index) => BigInt(index + 1)).map(async id => { const value = await client.readContract({ address, abi: marketAbi, functionName: "pointSales", args: [id] }); return { id, seller: value[0], buyer: value[1] || zeroAddress, token: value[2], price: value[3], listDeadline: value[4], settleDeadline: value[5], termsHash: value[6], sellerDelivered: value[7], buyerConfirmed: value[8], state: Number(value[9]) } satisfies ArcPointSale; })); return { jobs: jobs.reverse(), pointSales: pointSales.reverse() }; }
