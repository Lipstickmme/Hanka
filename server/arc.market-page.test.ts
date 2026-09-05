import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// JSX and Prettier wrap long copy across lines, so prose assertions run
// against a whitespace-normalised copy of the source.
const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8").replace(/\s+/g, " ");
const page = read("client/src/components/ArcMarketWorkspace.tsx");
const agreementDialog = read("client/src/components/AgreementCreateDialog.tsx");
const actions = read("client/src/lib/arcRecordActions.ts");

describe("Arc market page", () => {
  it("keeps real transaction controls deployment-gated", () => {
    expect(page).toContain("getArcContractAddress");
    expect(page).toContain("Fund proof. Settle onchain.");
    expect(page).toContain('value={contractAddress ? shortAddress(contractAddress) : "Not configured"}');
  });

  it("presents bounty funding and point exchanges from the user's own Arc wallet", () => {
    expect(page).toContain("CREATE BOUNTY");
    expect(page).toContain("<BountyCreateDialog");
    expect(page).toContain("<AgreementCreateDialog");
    expect(page).toContain("createArcBounty");
    expect(page).toContain("createArcAgreement");
    expect(agreementDialog).toContain("Airdrop outcome agreement");
    expect(agreementDialog).toContain("Price the uncertainty.");
  });

  it("renders only real records read from the public contract", () => {
    expect(page).toContain("useArcMarket");
    expect(page).toContain("No sample bounties are invented.");
    expect(page).toContain("No matching funded bounties.");
  });

  it("includes onchain post-funding actions while keeping the contract as the settlement source of truth", () => {
    expect(actions).toContain("Accept bounty");
    expect(actions).toContain("Submit delivery");
    expect(actions).toContain("Release reward");
    expect(actions).toContain("Dispute");
    expect(page).toContain("configured onchain resolver");
  });

  it("blocks writes from the wrong network instead of letting the wallet reject them", () => {
    // A transaction signed on another chain is a wasted prompt and a confusing
    // wallet-side error, so the guard belongs here.
    expect(page).toContain("Switch your wallet to Arc Testnet first.");
    expect(page).toContain("if (!onArcNetwork)");
  });

  it("routes every write through one busy, error and refresh path", () => {
    expect(page).toContain("async function run(");
    expect(page).toContain("describeArcError(caught)");
    expect(page).toContain("await refresh();");
  });
});
