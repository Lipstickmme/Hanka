import { readFileSync } from "node:fs";
import path from "node:path";
import solc from "solc";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const sourcePath = path.resolve("contracts/src/HankaMarketV2.sol");
const source = readFileSync(sourcePath, "utf8");
const input = {
  language: "Solidity",
  sources: { "HankaMarketV2.sol": { content: source } },
  settings: {
    viaIR: true,
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};
const result = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (result.errors ?? []).filter(item => item.severity === "error");
if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join("\n"));
const artifact = result.contracts["HankaMarketV2.sol"].HankaMarketV2;

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required. Do not commit it or expose it through a VITE_ variable.`);
  return value;
}

function address(name, fallback) {
  const value = process.env[name]?.trim() || fallback;
  if (!value || !isAddress(value)) throw new Error(`${name} must be a valid EVM address.`);
  return value;
}

function allowedTokens() {
  const values = (process.env.ARC_V2_ALLOWED_TOKENS?.trim() || "0x3600000000000000000000000000000000000000")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  if (!values.length || values.some(value => !isAddress(value))) throw new Error("ARC_V2_ALLOWED_TOKENS must be a comma-separated list of valid ERC-20 addresses.");
  return values;
}

const privateKey = required("ARC_TESTNET_DEPLOYER_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("ARC_TESTNET_DEPLOYER_PRIVATE_KEY must be a 32-byte hexadecimal private key.");
const account = privateKeyToAccount(privateKey);
const admin = address("ARC_V2_ADMIN_ADDRESS", account.address);
const arbiter = address("ARC_V2_ARBITER_ADDRESS");
const pauser = address("ARC_V2_PAUSER_ADDRESS");
const sourceAttester = address("ARC_V2_SOURCE_ATTESTER_ADDRESS");
const treasury = address("ARC_V2_TREASURY_ADDRESS");
const feeBps = Number(process.env.ARC_V2_DEFAULT_FEE_BPS ?? "500");
if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) throw new Error("ARC_V2_DEFAULT_FEE_BPS must be an integer from 0 to 1000.");
const tokens = allowedTokens();
const rpcUrl = process.env.ARC_TESTNET_RPC_URL?.trim() || "https://rpc.testnet.arc.io";
const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) });
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });

console.log(`Preparing HankaMarketV2 on Arc Testnet from ${account.address}.`);
console.log(`Admin: ${admin}\nArbiter: ${arbiter}\nPauser: ${pauser}\nSource attester: ${sourceAttester}\nTreasury: ${treasury}\nDefault fee: ${feeBps} BPS\nAllowed tokens: ${tokens.join(", ")}`);
const hash = await walletClient.deployContract({
  abi: artifact.abi,
  bytecode: `0x${artifact.evm.bytecode.object}`,
  args: [admin, arbiter, pauser, sourceAttester, treasury, tokens, feeBps],
});
console.log(`Deployment submitted: ${hash}`);
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("Deployment did not complete successfully.");
console.log(`HANKA_MARKET_V2_TESTNET_ADDRESS=${receipt.contractAddress}`);
console.log("Verify the source on ArcScan, review every role address, and update the web application only with the public contract address after independent review.");
