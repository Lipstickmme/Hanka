import { readFileSync } from "node:fs";
import path from "node:path";
import solc from "solc";
import { createPublicClient, createWalletClient, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";

const sourcePath = path.resolve("contracts/src/HankaArcEscrow.sol");
const source = readFileSync(sourcePath, "utf8");
const input = { language: "Solidity", sources: { "HankaArcEscrow.sol": { content: source } }, settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } } } };
const result = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (result.errors ?? []).filter(item => item.severity === "error");
if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join("\n"));
const artifact = result.contracts["HankaArcEscrow.sol"].HankaArcEscrow;

function required(name) { const value = process.env[name]?.trim(); if (!value) throw new Error(`${name} is required. Do not place it in source control or a VITE_ variable.`); return value; }
function address(name, fallback) { const value = process.env[name]?.trim() || fallback; if (!value || !isAddress(value)) throw new Error(`${name} must be a valid EVM address.`); return value; }

const privateKey = required("ARC_TESTNET_DEPLOYER_PRIVATE_KEY");
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) throw new Error("ARC_TESTNET_DEPLOYER_PRIVATE_KEY must be a 32-byte hexadecimal private key.");
const account = privateKeyToAccount(privateKey);
const owner = address("ARC_OWNER_ADDRESS", account.address);
const resolver = address("ARC_RESOLVER_ADDRESS");
const treasury = address("ARC_TREASURY_ADDRESS");
const feeBps = Number(process.env.ARC_FEE_BPS ?? "500");
if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) throw new Error("ARC_FEE_BPS must be an integer between 0 and 1000.");
const tokens = [
  "0x3600000000000000000000000000000000000000",
  "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
  "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
];
const rpcUrl = process.env.ARC_TESTNET_RPC_URL?.trim() || "https://rpc.testnet.arc.io";
const client = createWalletClient({ account, chain: arcTestnet, transport: http(rpcUrl) });
const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpcUrl) });

console.log(`Preparing HankaArcEscrow for Arc Testnet from ${account.address}.`);
console.log(`Owner: ${owner}\nResolver: ${resolver}\nTreasury: ${treasury}\nFee: ${feeBps} BPS`);
const hash = await client.deployContract({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, args: [owner, resolver, treasury, tokens, feeBps] });
console.log(`Deployment submitted: ${hash}`);
console.log("Wait for confirmation before placing the address in VITE_ARC_TESTNET_ESCROW_ADDRESS.");
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success" || !receipt.contractAddress) throw new Error("Deployment did not complete successfully.");
console.log(`HANKA_ARC_TESTNET_ESCROW_ADDRESS=${receipt.contractAddress}`);
