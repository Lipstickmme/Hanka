import { Button } from "@/components/ui/button";
import { connectArcWallet, listArcWalletProviders, type ArcWalletProvider } from "@/lib/arcTestnet";
import { ARC_MARK_URL } from "@/lib/brandAssets";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Address } from "viem";

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

const isSupportedWallet = (provider: ArcWalletProvider) => {
  const name = provider.name.toLowerCase();
  return name.includes("metamask") || name.includes("phantom");
};

type ArcWalletConnectProps = {
  address?: Address | "";
  busy?: boolean;
  disabled?: boolean;
  className?: string;
  onConnected: (address: Address) => void | Promise<void>;
};

/** User-selected EIP-6963 wallet connection with a fallback for standard injected providers. */
export function ArcWalletConnect({ address, busy = false, disabled = false, className, onConnected }: ArcWalletConnectProps) {
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<ArcWalletProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingProviders(true);
    void listArcWalletProviders().then(found => {
      if (active) setProviders(found.filter(isSupportedWallet));
    }).finally(() => { if (active) setLoadingProviders(false); });
    return () => { active = false; };
  }, [open]);

  async function select(provider?: ArcWalletProvider) {
    try {
      setConnectingId(provider?.id ?? "default");
      const connected = await connectArcWallet(provider?.provider);
      await onConnected(connected.address);
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect the selected EVM wallet.");
    } finally {
      setConnectingId(null);
    }
  }

  const connecting = Boolean(connectingId) || busy;
  return <div className="arc-wallet-connect relative z-[100]"><Button size="sm" type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(current => !current)} disabled={disabled || connecting} className={className ?? "bg-[var(--hanka-accent)] text-[var(--hanka-accent-text)]"}><span className="arc-wallet-mark"><img src={ARC_MARK_URL} alt="" aria-hidden="true" /></span>{connecting ? <Loader2 className="size-4 animate-spin" /> : null}{address ? shortAddress(address) : "Connect EVM wallet"}<ChevronDown className={`size-3 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} /></Button>{open ? <div role="menu" className="arc-wallet-menu absolute right-0 top-[calc(100%+.5rem)] z-50 w-72 border border-[var(--hanka-line)] bg-[#101713] p-2 text-[var(--hanka-text)] shadow-2xl"><p className="px-2 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[var(--hanka-muted)]">Choose EVM wallet</p><p className="px-2 pb-3 text-xs leading-5 text-[var(--hanka-muted)]">HANKA will add or switch to Arc Testnet before requesting your account.</p>{loadingProviders ? <div className="flex items-center gap-2 px-2 py-3 text-xs text-[var(--hanka-muted)]"><Loader2 className="size-3 animate-spin" />Looking for wallets…</div> : providers.length ? <div className="grid gap-1">{providers.map(provider => <button key={provider.id} role="menuitem" type="button" onClick={() => void select(provider)} disabled={connecting} className="flex min-h-11 items-center justify-between gap-3 border border-transparent px-3 text-left text-sm font-medium hover:border-[var(--hanka-line)] hover:bg-[#172019] disabled:opacity-60"><span>{provider.name}</span>{connectingId === provider.id ? <Loader2 className="size-4 animate-spin" /> : address && <Check className="size-4 text-[var(--hanka-accent)]" />}</button>)}</div> : <button role="menuitem" type="button" onClick={() => void select()} disabled={connecting} className="flex min-h-11 w-full items-center justify-between gap-3 border border-[var(--hanka-line)] px-3 text-left text-sm font-medium hover:bg-[#172019] disabled:opacity-60"><span>Browser EVM wallet</span>{connectingId === "default" ? <Loader2 className="size-4 animate-spin" /> : null}</button>}<p className="px-2 pb-1 pt-3 text-[10px] leading-4 text-[var(--hanka-muted)]">MetaMask, Rabby, Coinbase Wallet, Rainbow, and other EIP-1193 wallets are supported when installed.</p></div> : null}</div>;
}
