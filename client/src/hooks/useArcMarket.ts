import {
  describeArcError,
  getArcArbiter,
  getArcMarketSnapshot,
  type ArcMarketSnapshot,
} from "@/lib/arcTestnet";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address } from "viem";

export type ArcMarketState = {
  snapshot: ArcMarketSnapshot | null;
  arbiter: Address | null;
  loading: boolean;
  /** Set when the chain read failed, so the page can show a retry instead of an empty market. */
  error: string | null;
  refresh: () => Promise<void>;
};

const REFRESH_INTERVAL_MS = 45_000;

/**
 * Loads public market state and keeps it fresh.
 *
 * Read failures are surfaced as a short message rather than thrown: an
 * unreachable RPC should render a retry panel, not a blank board or a wall of
 * viem internals in a toast.
 */
export function useArcMarket(options: { pollWhileVisible?: boolean } = {}): ArcMarketState {
  const { pollWhileVisible = true } = options;
  const [snapshot, setSnapshot] = useState<ArcMarketSnapshot | null>(null);
  const [arbiter, setArbiter] = useState<Address | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const next = await getArcMarketSnapshot();
      setSnapshot(next);
      setError(null);
    } catch (caught) {
      console.error("[ArcMarket] snapshot read failed", caught);
      setError(describeArcError(caught));
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void getArcArbiter().then(setArbiter);
  }, [refresh]);

  useEffect(() => {
    if (!pollWhileVisible) return;
    const tick = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = window.setInterval(tick, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [pollWhileVisible, refresh]);

  return { snapshot, arbiter, loading, error, refresh };
}
