import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ARC_TESTNET_TOKENS, describeArcError, hankaArcTestnet, toTokenUnits } from "../client/src/lib/arcTestnet";
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_CHAIN_ID_HEX } from "../shared/arcNetwork";

const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
const client = read("client/src/lib/arcTestnet.ts");
const control = read("client/src/components/ArcWalletConnect.tsx");
const context = read("client/src/contexts/ArcWalletContext.tsx");
const styles = read("client/src/index.css");

describe("Arc Testnet wallet configuration", () => {
  it("uses Arc Testnet's official network values and its documented test tokens", () => {
    expect(hankaArcTestnet.id).toBe(5_042_002);
    expect(ARC_TESTNET_CHAIN_ID).toBe(hankaArcTestnet.id);
    // Wallets receive the chain id as hex in wallet_addEthereumChain.
    expect(Number(ARC_TESTNET_CHAIN_ID_HEX)).toBe(ARC_TESTNET_CHAIN_ID);
    expect(hankaArcTestnet.rpcUrls.default.http).toContain("https://rpc.testnet.arc.io");
    expect(ARC_TESTNET_TOKENS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "USDC", address: "0x3600000000000000000000000000000000000000", decimals: 6 }),
        expect.objectContaining({ symbol: "EURC", address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a", decimals: 6 }),
        expect.objectContaining({ symbol: "cirBTC", address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF" }),
      ]),
    );
  });

  it("converts settlement input to the selected token's native units without native-USDC precision mixing", () => {
    expect(toTokenUnits("50", 6)).toBe(BigInt("50000000"));
    expect(toTokenUnits("0.000001", 6)).toBe(BigInt(1));
    // Silently truncating here would under-fund escrow by a rounding error.
    expect(() => toTokenUnits("1.0000001", 6)).toThrow("at most 6 decimal places");
    expect(() => toTokenUnits("0", 6)).toThrow("above zero");
    expect(() => toTokenUnits("-1", 6)).toThrow("valid positive token amount");
    expect(() => toTokenUnits("abc", 6)).toThrow("valid positive token amount");
  });

  it("discovers EIP-6963 wallets, retains injected fallbacks, and adds Arc Testnet before account access", () => {
    expect(client).toContain("eip6963:requestProvider");
    expect(client).toContain("eip6963:announceProvider");
    expect(client).toContain("provider.providers?.length");
    // Switching alone fails on a wallet that has never seen Arc Testnet.
    expect(client).toContain("await walletClient.addChain({ chain: hankaArcTestnet })");
    expect(client).toContain("await walletClient.switchChain({ id: hankaArcTestnet.id })");
    expect(client).toContain("isUnknownChainError");
    expect(control).toContain("Choose EVM wallet");
    expect(control).toContain("MetaMask, Rabby, Coinbase Wallet, Rainbow");
    expect(control).toContain("arc-wallet-mark");
  });

  it("does not narrow discovery to a hardcoded pair of wallets", () => {
    // The regressed build filtered discovery down to MetaMask and Phantom, so
    // every other installed wallet was invisible.
    expect(client).not.toContain('name.includes("metamask") || name.includes("phantom")');
    expect(control).not.toContain("isSupportedWallet");
  });

  it("restores a session silently and follows account and chain changes", () => {
    expect(client).toContain("export async function reconnectArcWallet");
    expect(client).toContain("walletClient.getAddresses()");
    expect(client).toContain('target.on("accountsChanged"');
    expect(client).toContain('target.on("chainChanged"');
    expect(context).toContain("reconnectArcWallet");
    expect(context).toContain("watchArcWallet");
    expect(context).toContain("onArcNetwork");
  });

  it("offers a route into a signing context on a mobile browser with no injected provider", () => {
    expect(client).toContain("export function arcWalletDeepLinks");
    expect(client).toContain("https://metamask.app.link/dapp/");
    expect(control).toContain("Open HANKA inside a wallet app");
    expect(control).toContain("deepLinks.map");
  });

  it("presents the chooser as a reachable bottom sheet on small screens", () => {
    expect(styles).toContain(".arc-wallet-menu");
    expect(styles).toContain(".arc-wallet-scrim");
    expect(styles).toMatch(/@media \(max-width: 640px\) \{[\s\S]*?\.arc-wallet-menu \{ position: fixed;/);
    expect(control).toContain('event.key === "Escape"');
    expect(control).toContain("mousedown");
  });
});

describe("Arc error reporting", () => {
  it("turns a wallet rejection into one sentence instead of a raw provider dump", () => {
    expect(describeArcError({ code: 4001, message: "User rejected the request." })).toBe("You rejected the request in your wallet.");
    expect(describeArcError({ code: -32002 })).toContain("pending request");
  });

  it("explains an unreachable RPC rather than pasting the request body", () => {
    // This is the failure the market showed users: a full viem HTTP dump.
    const viemStyle = {
      shortMessage: "HTTP request failed.",
      details: 'URL: https://rpc.testnet.arc.io\nRequest body: {"method":"eth_call"}\nDetails: Failed to fetch',
    };
    const message = describeArcError(viemStyle);
    expect(message).toBe("Could not reach an Arc Testnet RPC endpoint. Check your connection and try again.");
    expect(message).not.toContain("Request body");
    expect(message).not.toContain("https://");
  });

  it("names the contract's own revert reason when there is one", () => {
    expect(describeArcError({ message: "reverted with custom error InvalidState()" })).toBe(
      "The record has already moved past this action.",
    );
    expect(describeArcError({ message: "reverted with custom error InvalidToken()" })).toBe(
      "That token is not allowlisted by the market contract.",
    );
    expect(describeArcError({ message: "reverted with custom error Unauthorized()" })).toBe(
      "This wallet is not a party to that record.",
    );
  });

  it("always returns something printable", () => {
    expect(describeArcError(null)).toBe("Something went wrong.");
    expect(describeArcError({})).toBe("Something went wrong.");
  });
});
