import { Redirect } from "wouter";

/**
 * Kept as a compatibility route for historic HANKA URLs. Social proof is now a
 * funded Arc Testnet Bounty, so the former dual-rail manual OTC market no
 * longer renders or loads wallet/payment integrations.
 */
export default function MarketHome() {
  return <Redirect to="/arc" replace />;
}
