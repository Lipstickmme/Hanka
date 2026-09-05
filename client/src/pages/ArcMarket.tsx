import { ArcMarketWorkspace } from "@/components/ArcMarketWorkspace";

/** Public market entry point. Renders the full workspace on the bounty board. */
export default function ArcMarket() {
  return <ArcMarketWorkspace initialMode="bounties" />;
}
