import {
  Connection,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { Buffer } from "buffer";

type SolanaProvider = {
  isPhantom?: boolean;
  isBackpack?: boolean;
  isSolflare?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey: PublicKey }>;
  signMessage: (message: Uint8Array, display?: "utf8") => Promise<{ signature: Uint8Array }>;
  signAndSendTransaction: (transaction: Transaction) => Promise<{ signature: string }>;
};

export type WalletOption = { id: string; label: string; provider: SolanaProvider };

declare global {
  interface Window {
    solana?: SolanaProvider & { providers?: SolanaProvider[] };
    phantom?: { solana?: SolanaProvider };
    backpack?: { solana?: SolanaProvider };
    solflare?: SolanaProvider;
    okxwallet?: { solana?: SolanaProvider };
    exodus?: { solana?: SolanaProvider };
    braveSolana?: SolanaProvider;
    opera?: { solana?: SolanaProvider };
  }
}

const publicRpc = "https://api.mainnet-beta.solana.com";
let activeProvider: SolanaProvider | null = null;

function providerLabel(provider: SolanaProvider) {
  if (provider.isPhantom) return "Phantom";
  if (provider.isBackpack) return "Backpack";
  if (provider.isSolflare) return "Solflare";
  return "Solana wallet";
}

export function getWalletOptions(): WalletOption[] {
  if (typeof window === "undefined") return [];
  const candidates: Array<{ id: string; label: string; provider?: SolanaProvider }> = [
    { id: "phantom", label: "Phantom", provider: window.phantom?.solana ?? (window.solana?.isPhantom ? window.solana : undefined) },
    { id: "backpack", label: "Backpack", provider: window.backpack?.solana },
    { id: "solflare", label: "Solflare", provider: window.solflare },
    { id: "okx", label: "OKX Wallet", provider: window.okxwallet?.solana },
    { id: "exodus", label: "Exodus", provider: window.exodus?.solana },
    { id: "brave", label: "Brave Wallet", provider: window.braveSolana },
    { id: "opera", label: "Opera Wallet", provider: window.opera?.solana },
  ];
  const discovered = window.solana?.providers?.map((provider, index) => ({ id: `provider-${index}`, label: providerLabel(provider), provider })) ?? [];
  const options = [...candidates, ...discovered].filter((item): item is { id: string; label: string; provider: SolanaProvider } => Boolean(item.provider));
  return options.filter((item, index) => options.findIndex(other => other.provider === item.provider) === index);
}

export function getMobileWalletLinks(url: string) {
  const encodedUrl = encodeURIComponent(url);
  return [
    { id: "phantom", label: "Open in Phantom", href: `https://phantom.app/ul/browse/${encodedUrl}?ref=hanka` },
    { id: "solflare", label: "Open in Solflare", href: `https://solflare.com/ul/v1/browse/${encodedUrl}` },
    { id: "backpack", label: "Open in Backpack", href: `https://backpack.app/ul/v1/browse/${encodedUrl}` },
  ];
}

function providerOrThrow() {
  const provider = activeProvider ?? getWalletOptions()[0]?.provider;
  if (!provider) throw new Error("Install a Solana wallet such as Phantom, Backpack, or Solflare to continue");
  return provider;
}

function installBufferShim() {
  (globalThis as typeof globalThis & { Buffer?: typeof Buffer }).Buffer = Buffer;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function usdcStringToMicro(amountUsdc: string) {
  const normalized = String(amountUsdc ?? "").trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) {
    throw new Error("Enter a valid USDC amount with up to six decimal places");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const micro = Number(whole) * 1_000_000 + Number(fraction.padEnd(6, "0"));
  if (!Number.isSafeInteger(micro) || micro <= 0) throw new Error("The USDC amount is invalid");
  return micro;
}

export async function connectWallet(walletId?: string) {
  const option = getWalletOptions().find(item => item.id === walletId) ?? getWalletOptions()[0];
  if (!option) throw new Error("Install a Solana wallet such as Phantom, Backpack, or Solflare to continue");
  activeProvider = option.provider;
  const result = await activeProvider.connect();
  return result.publicKey.toBase58();
}

export async function signWalletMessage(message: string) {
  const provider = providerOrThrow();
  const signature = await provider.signMessage(new TextEncoder().encode(message), "utf8");
  return toBase64(signature.signature);
}

export async function sendUsdcPayment(input: {
  recipientWallet: string;
  usdcMint: string;
  amountUsdc: string;
}) {
  installBufferShim();
  const {
    createAssociatedTokenAccountInstruction,
    createTransferCheckedInstruction,
    getAssociatedTokenAddress,
  } = await import("@solana/spl-token");
  const provider = providerOrThrow();
  const connection = new Connection(publicRpc, "confirmed");
  const sender = provider.publicKey ?? (await provider.connect()).publicKey;
  const mint = new PublicKey(input.usdcMint);
  const recipient = new PublicKey(input.recipientWallet);
  const amount = usdcStringToMicro(input.amountUsdc);
  const senderUsdc = await getAssociatedTokenAddress(mint, sender);
  const recipientUsdc = await getAssociatedTokenAddress(mint, recipient);

  const transaction = new Transaction();
  const recipientAccount = await connection.getAccountInfo(recipientUsdc, "confirmed");
  if (!recipientAccount) transaction.add(createAssociatedTokenAccountInstruction(sender, recipientUsdc, recipient, mint));
  transaction.add(createTransferCheckedInstruction(senderUsdc, mint, recipientUsdc, sender, amount, 6));
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = sender;
  const result = await provider.signAndSendTransaction(transaction);
  return result.signature;
}
