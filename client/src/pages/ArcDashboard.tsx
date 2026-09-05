import { ArcMarketWorkspace } from "@/components/ArcMarketWorkspace";

/**
 * Wallet dashboard. Deliberately the same workspace as /arc — one surface with
 * everything on it — opened on the wallet-scoped activity tab.
 */
export default function ArcDashboard() {
  return <ArcMarketWorkspace initialMode="activity" />;
}
