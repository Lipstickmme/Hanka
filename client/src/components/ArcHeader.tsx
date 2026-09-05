import { ArcWalletConnect } from "@/components/ArcWalletConnect";
import { Button } from "@/components/ui/button";
import { useArcWallet } from "@/contexts/ArcWalletContext";
import { RefreshCw } from "lucide-react";
import { Link, useLocation } from "wouter";

type ArcHeaderProps = { onRefresh?: () => void; refreshing?: boolean };

/**
 * Shared market header. "My activity" appears only once a wallet is connected,
 * because the dashboard is wallet-scoped and has nothing to show otherwise.
 */
export function ArcHeader({ onRefresh, refreshing = false }: ArcHeaderProps) {
  const { address } = useArcWallet();
  const [location] = useLocation();

  return (
    <header className="hanka-header sticky top-0 z-50">
      <div className="market-shell flex min-h-16 flex-wrap items-center justify-between gap-3 py-2">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/" className="font-display text-xl tracking-[-.08em] sm:text-2xl">
            HANKA MARKET
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            <Link href="/arc" className="hanka-tab" aria-selected={location === "/arc"}>
              MARKET
            </Link>
            {address ? (
              <Link href="/arc/dashboard" className="hanka-tab" aria-selected={location.startsWith("/arc/dashboard")}>
                MY ACTIVITY
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh ? (
            <Button variant="ghost" size="sm" onClick={onRefresh} disabled={refreshing} aria-label="Refresh market data">
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{refreshing ? "Refreshing…" : "Refresh"}</span>
            </Button>
          ) : null}
          <ArcWalletConnect />
        </div>
      </div>
      {address ? (
        <div className="market-shell flex gap-1 pb-2 sm:hidden">
          <Link href="/arc" className="hanka-tab flex-1 justify-center" aria-selected={location === "/arc"}>
            MARKET
          </Link>
          <Link href="/arc/dashboard" className="hanka-tab flex-1 justify-center" aria-selected={location.startsWith("/arc/dashboard")}>
            MY ACTIVITY
          </Link>
        </div>
      ) : null}
    </header>
  );
}
