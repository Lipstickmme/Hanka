import {
  ARC_TESTNET_CHAIN_ID,
  connectArcWallet,
  describeArcError,
  ensureArcChain,
  listArcWalletProviders,
  reconnectArcWallet,
  watchArcWallet,
  type ArcEip1193Provider,
  type ArcWalletProvider,
} from "@/lib/arcTestnet";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { Address } from "viem";

const LAST_WALLET_KEY = "hanka.arc.lastWallet";

type ArcWalletContextValue = {
  address: Address | null;
  chainId: number | null;
  provider: ArcEip1193Provider | null;
  providerName: string | null;
  connecting: boolean;
  restoring: boolean;
  onArcNetwork: boolean;
  connect: (choice?: ArcWalletProvider) => Promise<Address | null>;
  disconnect: () => void;
  switchToArc: () => Promise<void>;
};

const ArcWalletContext = createContext<ArcWalletContextValue | null>(null);

/**
 * Holds the wallet session for the whole app.
 *
 * Connection used to live in local state on the market page, so navigating to
 * another route dropped it and a refresh always started from disconnected. This
 * keeps one session, restores it silently, and follows the wallet when the user
 * switches account or network in the extension.
 */
export function ArcWalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [providerName, setProviderName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const providerRef = useRef<ArcEip1193Provider | null>(null);
  const [providerVersion, setProviderVersion] = useState(0);

  const adopt = useCallback((choice: ArcWalletProvider | null) => {
    providerRef.current = choice?.provider ?? null;
    setProviderName(choice?.name ?? null);
    setProviderVersion(version => version + 1);
  }, []);

  const disconnect = useCallback(() => {
    providerRef.current = null;
    setAddress(null);
    setChainId(null);
    setProviderName(null);
    setProviderVersion(version => version + 1);
    try {
      window.localStorage.removeItem(LAST_WALLET_KEY);
    } catch {
      // Private browsing modes can refuse storage; the session simply will not persist.
    }
  }, []);

  // Silent restore: `eth_accounts` returns already-authorised accounts, so a
  // refresh reconnects without prompting the user for anything.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        let remembered: string | null = null;
        try {
          remembered = window.localStorage.getItem(LAST_WALLET_KEY);
        } catch {
          remembered = null;
        }
        const providers = await listArcWalletProviders();
        const previous = remembered ? providers.find(item => item.id === remembered || item.name === remembered) : undefined;
        const candidate = previous ?? providers[0];
        const session = await reconnectArcWallet(candidate?.provider);
        if (!active || !session) return;
        adopt(candidate ?? null);
        setAddress(session.address);
        setChainId(session.chainId);
      } finally {
        if (active) setRestoring(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [adopt]);

  // Follow account and network changes made inside the wallet itself.
  useEffect(() => {
    return watchArcWallet(providerRef.current ?? undefined, {
      onAccountsChanged: accounts => {
        const next = accounts[0] ?? null;
        if (!next) {
          disconnect();
          return;
        }
        setAddress(next);
      },
      onChainChanged: next => setChainId(next),
    });
  }, [disconnect, providerVersion]);

  const connect = useCallback(
    async (choice?: ArcWalletProvider) => {
      setConnecting(true);
      try {
        const session = await connectArcWallet(choice?.provider);
        adopt(choice ?? null);
        setAddress(session.address);
        setChainId(session.chainId);
        try {
          window.localStorage.setItem(LAST_WALLET_KEY, choice?.id ?? choice?.name ?? "injected");
        } catch {
          // Not fatal: the session works, it just will not be remembered.
        }
        return session.address;
      } catch (error) {
        toast.error(describeArcError(error));
        return null;
      } finally {
        setConnecting(false);
      }
    },
    [adopt],
  );

  const switchToArc = useCallback(async () => {
    try {
      const client = await ensureArcChain(providerRef.current ?? undefined);
      setChainId(await client.getChainId());
    } catch (error) {
      toast.error(describeArcError(error));
    }
  }, []);

  const value = useMemo<ArcWalletContextValue>(
    () => ({
      address,
      chainId,
      provider: providerRef.current,
      providerName,
      connecting,
      restoring,
      onArcNetwork: chainId === ARC_TESTNET_CHAIN_ID,
      connect,
      disconnect,
      switchToArc,
    }),
    [address, chainId, providerName, connecting, restoring, connect, disconnect, switchToArc],
  );

  return <ArcWalletContext.Provider value={value}>{children}</ArcWalletContext.Provider>;
}

export function useArcWallet() {
  const value = useContext(ArcWalletContext);
  if (!value) throw new Error("useArcWallet must be used inside ArcWalletProvider.");
  return value;
}
