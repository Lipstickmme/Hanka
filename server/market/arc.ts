import { createPublicClient, defineChain, getEventSelector, http, parseAbiItem, parseUnits, type Address, type Hex } from "viem";

const arcTestnet = defineChain({
  id: 5_042_002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.testnet.arc.io"] } },
  testnet: true,
});
const ARC_TESTNET_USDC = "0x3600000000000000000000000000000000000000" as Address;

const transferEvent = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");

const normalized = (value: string) => value.toLowerCase();

export async function verifyArcUsdcManualOtcPayment(input: {
  hash: string;
  buyerWallet: string;
  expectedUsdc: string;
  earliestAllowedAt: Date;
}) {
  const recipient = process.env.VITE_ARC_OTC_RECIPIENT_ADDRESS?.trim() as Address | undefined;
  if (!recipient) throw new Error("Arc manual OTC recipient is not configured");
  const client = createPublicClient({ chain: arcTestnet, transport: http() });
  const receipt = await client.getTransactionReceipt({ hash: input.hash as Hex });
  if (receipt.status !== "success") throw new Error("Arc payment did not succeed");
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (Number(block.timestamp) * 1_000 < input.earliestAllowedAt.getTime() - 60_000) throw new Error("Arc payment predates this request");

  const expected = parseUnits(input.expectedUsdc, 6);
  const transfer = receipt.logs.find(log => {
    if (normalized(log.address) !== normalized(ARC_TESTNET_USDC) || log.topics[0] !== getEventSelector(transferEvent)) return false;
    if (log.topics.length < 3 || !log.data) return false;
    const from = `0x${log.topics[1]?.slice(-40)}`.toLowerCase();
    const to = `0x${log.topics[2]?.slice(-40)}`.toLowerCase();
    const value = BigInt(log.data);
    return from === normalized(input.buyerWallet) && to === normalized(recipient) && value === expected;
  });
  if (!transfer) throw new Error("The confirmed Arc USDC transfer does not exactly match this request");
  return { hash: input.hash, receivedUsdc: input.expectedUsdc };
}
