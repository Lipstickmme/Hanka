import { readFileSync } from "node:fs";
import path from "node:path";
import solc from "solc";

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

const contract = result.contracts["HankaMarketV2.sol"].HankaMarketV2;
const functions = new Set(contract.abi.filter(item => item.type === "function").map(item => item.name));
for (const name of ["createBounty", "createSocialOffer", "createSocialBounty", "acceptSocialBounty", "openRetentionCase", "settleAgreementWithSignatures", "timeoutAgreement", "withdrawAccruedFees"]) {
  if (!functions.has(name)) throw new Error(`Compiled ABI is missing ${name}.`);
}
if (!contract.evm.bytecode.object) throw new Error("Compiled bytecode is empty.");
console.log(`HankaMarketV2 compiled successfully (${contract.abi.length} ABI entries).`);
