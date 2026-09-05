import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/contexts/ArcWalletContext";
import {
  arcExplorerAddress,
  arcWalletDeepLinks,
  hasInjectedArcWallet,
  isMobileBrowser,
  listArcWalletProviders,
  type ArcWalletProvider,
} from "@/lib/arcTestnet";
import { ARC_MARK_URL } from "@/lib/brandAssets";
import { Check, ChevronDown, Copy, ExternalLink, Loader2, LogOut, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

type ArcWalletConnectProps = { className?: string; onConnected?: (address: string) => void };

/**
 * Wallet control for the header.
 *
 * On phones the chooser is a bottom sheet: the old absolutely-positioned menu
 * hung inside a sticky header, so on a small screen it was clipped, unscrollable
 * and easy to miss. When no wallet is injected — the normal case in mobile
 * Safari and Chrome — it offers deep links back into a wallet's own browser
 * instead of the old dead-end error.
 */
export function ArcWalletConnect({ className, onConnected }: ArcWalletConnectProps) {
  const { address, connect, connecting, disconnect, onArcNetwork, providerName, restoring, switchToArc } = useArcWallet();
  const [open, setOpen] = useState(false);
  const [providers, setProviders] = useState<ArcWalletProvider[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoadingProviders(true);
    void listArcWalletProviders()
      .then(found => {
        if (active) setProviders(found);
      })
      .finally(() => {
        if (active) setLoadingProviders(false);
      });
    return () => {
      active = false;
    };
  }, [open]);

  // Close on Escape and on any click outside, and stop the page scrolling
  // behind the mobile sheet.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    const previousOverflow = document.body.style.overflow;
    if (window.matchMedia("(max-width: 640px)").matches) document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  async function select(choice?: ArcWalletProvider) {
    setPendingId(choice?.id ?? "injected");
    try {
      const connected = await connect(choice);
      if (connected) {
        setOpen(false);
        onConnected?.(connected);
      }
    } finally {
      setPendingId(null);
    }
  }

  async function copyAddress() {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Wallet address copied.");
    } catch {
      toast.error("Your browser blocked clipboard access.");
    }
  }

  const busy = connecting || restoring;
  const deepLinks = arcWalletDeepLinks();
  const showDeepLinks = !loadingProviders && providers.length === 0 && (isMobileBrowser() || !hasInjectedArcWallet());

  return (
    <div ref={containerRef} className="arc-wallet-connect">
      <Button
        size="sm"
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen(current => !current)}
        disabled={busy}
        className={className ?? "arc-wallet-trigger"}
      >
        <span className="arc-wallet-mark">
          <img src={ARC_MARK_URL} alt="" aria-hidden="true" />
        </span>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        <span className="arc-wallet-label">{address ? shortAddress(address) : "Connect EVM wallet"}</span>
        <ChevronDown className={`size-3 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>

      {address && !onArcNetwork ? (
        <button type="button" className="arc-wallet-network-warning" onClick={() => void switchToArc()}>
          <TriangleAlert className="size-3" />
          Wrong network — switch to Arc Testnet
        </button>
      ) : null}

      {open ? (
        <>
          <div className="arc-wallet-scrim" aria-hidden="true" />
          <div role="menu" className="arc-wallet-menu">
            <div className="arc-wallet-menu-grip" aria-hidden="true" />

            {address ? (
              <div className="arc-wallet-account">
                <p className="arc-wallet-menu-title">Connected{providerName ? ` · ${providerName}` : ""}</p>
                <p className="arc-wallet-account-address">{address}</p>
                <div className="arc-wallet-account-actions">
                  <button type="button" onClick={() => void copyAddress()}>
                    <Copy className="size-3.5" />
                    Copy
                  </button>
                  <a href={arcExplorerAddress(address)} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" />
                    ArcScan
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      disconnect();
                      setOpen(false);
                    }}
                  >
                    <LogOut className="size-3.5" />
                    Disconnect
                  </button>
                </div>
              </div>
            ) : null}

            <p className="arc-wallet-menu-title">{address ? "Switch EVM wallet" : "Choose EVM wallet"}</p>
            <p className="arc-wallet-menu-note">HANKA will add or switch to Arc Testnet before requesting your account.</p>

            {loadingProviders ? (
              <div className="arc-wallet-loading">
                <Loader2 className="size-3 animate-spin" />
                Looking for wallets…
              </div>
            ) : providers.length ? (
              <div className="arc-wallet-options">
                {providers.map(provider => (
                  <button
                    key={provider.id}
                    role="menuitem"
                    type="button"
                    onClick={() => void select(provider)}
                    disabled={Boolean(pendingId)}
                    className="arc-wallet-option"
                  >
                    <span className="arc-wallet-option-name">
                      {provider.icon ? <img src={provider.icon} alt="" aria-hidden="true" /> : null}
                      {provider.name}
                    </span>
                    {pendingId === provider.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : address ? (
                      <Check className="size-4 text-[var(--hanka-accent)]" />
                    ) : null}
                  </button>
                ))}
              </div>
            ) : showDeepLinks ? (
              <div className="arc-wallet-options">
                <p className="arc-wallet-menu-note">
                  This browser has no EVM wallet. Open HANKA inside a wallet app to connect and sign.
                </p>
                {deepLinks.map(link => (
                  <a key={link.id} role="menuitem" href={link.url} className="arc-wallet-option" rel="noopener noreferrer">
                    <span className="arc-wallet-option-name">Open in {link.name}</span>
                    <ExternalLink className="size-3.5 opacity-70" />
                  </a>
                ))}
              </div>
            ) : (
              <button
                role="menuitem"
                type="button"
                onClick={() => void select()}
                disabled={Boolean(pendingId)}
                className="arc-wallet-option"
              >
                <span className="arc-wallet-option-name">Browser EVM wallet</span>
                {pendingId === "injected" ? <Loader2 className="size-4 animate-spin" /> : null}
              </button>
            )}

            <p className="arc-wallet-menu-footnote">
              MetaMask, Rabby, Coinbase Wallet, Rainbow, and other EIP-1193 wallets are supported when installed.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
