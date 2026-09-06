import { AgreementCreateDialog } from "@/components/AgreementCreateDialog";
import { ArcHeader } from "@/components/ArcHeader";
import { AgreementCard, BountyCard } from "@/components/ArcRecordCards";
import { BountyCreateDialog, type BountyDraft } from "@/components/BountyCreateDialog";
import { BountySubmissionDialog } from "@/components/BountySubmissionDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useArcWallet } from "@/contexts/ArcWalletContext";
import { useArcMarket } from "@/hooks/useArcMarket";
import {
  agreementStateLabel,
  bountyStateLabel,
  feePercent,
  formatTokenAmount,
  isAgreementClosed,
  isBountyClosed,
  shortAddress,
} from "@/lib/arcFormat";
import {
  ARC_AGREEMENT_STATE,
  ARC_BOUNTY_STATE,
  ARC_DIALECT_LABEL,
  ARC_TESTNET_TOKENS,
  arcCapabilities,
  acceptArcAgreement,
  acceptArcBounty,
  approveArcBounty,
  arcExplorerAddress,
  arcExplorerTx,
  cancelArcAgreement,
  cancelArcBounty,
  createArcAgreement,
  createArcBounty,
  declineArcAgreement,
  describeArcError,
  disputeArcAgreement,
  disputeArcBounty,
  expireArcAgreement,
  expireArcBounty,
  getArcAllowedTokens,
  getArcContractAddress,
  getArcRpcUrls,
  releaseArcRetentionBond,
  sameAddress,
  submitArcBounty,
  timeoutArcAcceptedBounty,
  timeoutArcAgreement,
  timeoutArcSubmittedBounty,
  type ArcAgreement,
  type ArcAgreementInput,
  type ArcBounty,
} from "@/lib/arcTestnet";
import { ARC_MARK_URL, OPERA_UNDERLAY_URL } from "@/lib/brandAssets";
import { AlertCircle, ExternalLink, Loader2, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";
import type { Hex } from "viem";

type Mode = "bounties" | "points" | "activity";
type TokenOption = { symbol: string; address: string; decimals: number };

const MODES: Array<{ id: Mode; label: string }> = [
  { id: "bounties", label: "BOUNTIES" },
  { id: "points", label: "POINT EXCHANGE" },
  { id: "activity", label: "MY ACTIVITY" },
];

const BOUNTY_FILTERS = ["all", "open", "accepted", "submitted", "paid", "disputed", "closed"] as const;
const AGREEMENT_FILTERS = ["all", "open", "funded", "disputed", "settled", "closed"] as const;

/**
 * The whole HANKA market on one surface.
 *
 * `/arc` and `/arc/dashboard` render this same component with a different tab
 * preselected, so the listing board and the wallet dashboard are never two
 * diverging implementations of the same data.
 */
export function ArcMarketWorkspace({ initialMode = "bounties" }: { initialMode?: Mode }) {
  const { address: wallet, onArcNetwork, switchToArc } = useArcWallet();
  const { snapshot, arbiter, loading, error, refresh } = useArcMarket();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [query, setQuery] = useState("");
  const [bountyFilter, setBountyFilter] = useState<(typeof BOUNTY_FILTERS)[number]>("all");
  const [agreementFilter, setAgreementFilter] = useState<(typeof AGREEMENT_FILTERS)[number]>("all");
  const [busy, setBusy] = useState(false);
  const [bountyDialogOpen, setBountyDialogOpen] = useState(false);
  const [agreementDialogOpen, setAgreementDialogOpen] = useState(false);
  const [submissionRecord, setSubmissionRecord] = useState<ArcBounty | null>(null);
  const [tokens, setTokens] = useState<TokenOption[]>([]);

  const contractAddress = getArcContractAddress();
  const rpcUrls = getArcRpcUrls();

  useEffect(() => setMode(initialMode), [initialMode]);

  // The token picker offers only what the deployed contract allowlists, so a
  // create flow cannot fail late with InvalidToken.
  useEffect(() => {
    let active = true;
    void getArcAllowedTokens()
      .then(allowed => {
        if (!active) return;
        setTokens(allowed.length ? allowed.map(token => ({ ...token })) : [{ ...ARC_TESTNET_TOKENS[0] }]);
      })
      .catch(() => {
        if (active) setTokens([{ ...ARC_TESTNET_TOKENS[0] }]);
      });
    return () => {
      active = false;
    };
  }, []);

  const bounties = snapshot?.bounties ?? [];
  const agreements = snapshot?.agreements ?? [];
  // Until the dialect is known, assume the fuller contract; the action table
  // falls back to the same default, and no write can fire before a snapshot.
  const capabilities = snapshot?.capabilities ?? arcCapabilities("v2");
  const actionContext = useMemo(() => ({ capabilities }), [capabilities]);

  const stats = useMemo(() => {
    const openBounties = bounties.filter(record => record.state === ARC_BOUNTY_STATE.open);
    const liveBounties = bounties.filter(record => !isBountyClosed(record) && record.state !== ARC_BOUNTY_STATE.none);
    const liveAgreements = agreements.filter(record => !isAgreementClosed(record) && record.state !== ARC_AGREEMENT_STATE.none);
    // Escrowed value only counts records the contract still holds funds for.
    const escrowed =
      liveBounties.reduce((total, record) => total + record.reward + record.retentionBond, BigInt(0)) +
      liveAgreements.reduce(
        (total, record) => total + record.collateral * BigInt(record.state === ARC_AGREEMENT_STATE.funded ? 2 : 1),
        BigInt(0),
      );
    const decimals = liveBounties[0]?.tokenDecimals ?? liveAgreements[0]?.tokenDecimals ?? 6;
    const symbol = liveBounties[0]?.tokenSymbol ?? liveAgreements[0]?.tokenSymbol ?? "USDC";
    return {
      openBounties: openBounties.length,
      liveBounties: liveBounties.length,
      liveAgreements: liveAgreements.length,
      settled: bounties.filter(isBountyClosed).length + agreements.filter(isAgreementClosed).length,
      escrowed: formatTokenAmount(escrowed, decimals, symbol),
    };
  }, [agreements, bounties]);

  // Until a snapshot lands there is nothing to count. Rendering 0 beside the
  // failure banner would claim the market is empty rather than unread.
  const unread = !snapshot;
  const count = (value: number) => (unread ? "—" : String(value));

  const mine = useMemo(() => {
    if (!wallet) return { bounties: [] as ArcBounty[], agreements: [] as ArcAgreement[] };
    return {
      bounties: bounties.filter(record => sameAddress(record.requester, wallet) || sameAddress(record.taker, wallet)),
      agreements: agreements.filter(record => sameAddress(record.maker, wallet) || sameAddress(record.taker, wallet)),
    };
  }, [agreements, bounties, wallet]);

  const walletEscrowed = useMemo(() => {
    if (!wallet) return null;
    const live = mine.bounties.filter(record => !isBountyClosed(record));
    const total = live.reduce((sum, record) => sum + (sameAddress(record.requester, wallet) ? record.reward : BigInt(0)), BigInt(0));
    const decimals = live[0]?.tokenDecimals ?? 6;
    return formatTokenAmount(total, decimals, live[0]?.tokenSymbol ?? "USDC");
  }, [mine.bounties, wallet]);

  const matchesQuery = (haystack: string[]) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return haystack.some(value => value.toLowerCase().includes(needle));
  };

  const visibleBounties = useMemo(() => {
    const source = mode === "activity" ? mine.bounties : bounties;
    return source.filter(record => {
      if (bountyFilter === "closed" && !isBountyClosed(record)) return false;
      if (bountyFilter !== "all" && bountyFilter !== "closed" && bountyStateLabel(record.state).toLowerCase() !== bountyFilter) return false;
      return matchesQuery([`#${record.id}`, record.requester, record.taker, record.termsHash, record.tokenSymbol]);
    });
  }, [bounties, bountyFilter, mine.bounties, mode, query]);

  const visibleAgreements = useMemo(() => {
    const source = mode === "activity" ? mine.agreements : agreements;
    return source.filter(record => {
      if (agreementFilter === "closed" && !isAgreementClosed(record)) return false;
      if (agreementFilter !== "all" && agreementFilter !== "closed" && agreementStateLabel(record.state).toLowerCase() !== agreementFilter) return false;
      return matchesQuery([`#${record.id}`, record.maker, record.taker, record.termsHash, record.tokenSymbol]);
    });
  }, [agreementFilter, agreements, mine.agreements, mode, query]);

  function announce(hash: Hex, message: string) {
    toast.success(message, {
      action: { label: "View on ArcScan", onClick: () => window.open(arcExplorerTx(hash), "_blank", "noopener,noreferrer") },
    });
  }

  /** Every write goes through here: one busy flag, one error path, one refresh. */
  async function run(message: string, action: () => Promise<Hex>) {
    if (!wallet) {
      toast.error("Connect an EVM wallet first.");
      return;
    }
    if (!onArcNetwork) {
      toast.error("Switch your wallet to Arc Testnet first.");
      void switchToArc();
      return;
    }
    setBusy(true);
    try {
      announce(await action(), message);
      await refresh();
    } catch (caught) {
      console.error("[ArcMarket] transaction failed", caught);
      toast.error(describeArcError(caught));
    } finally {
      setBusy(false);
    }
  }

  const bountyHandlers = {
    onAccept: (record: ArcBounty) => void run("Bounty accepted.", () => acceptArcBounty(record.id)),
    onSubmit: (record: ArcBounty) => setSubmissionRecord(record),
    onApprove: (record: ArcBounty) => void run("Reward released.", () => approveArcBounty(record.id)),
    onDispute: (record: ArcBounty) => void run("Dispute opened.", () => disputeArcBounty(record.id)),
    onCancel: (record: ArcBounty) => void run("Bounty cancelled and refunded.", () => cancelArcBounty(record.id)),
    onExpire: (record: ArcBounty) => void run("Bounty expired and refunded.", () => expireArcBounty(record.id)),
    onTimeoutAccepted: (record: ArcBounty) => void run("Bounty closed and refunded.", () => timeoutArcAcceptedBounty(record.id)),
    onTimeoutSubmitted: (record: ArcBounty) => void run("Reward released after the review window.", () => timeoutArcSubmittedBounty(record.id)),
    onReleaseBond: (record: ArcBounty) => void run("Retention bond released.", () => releaseArcRetentionBond(record.id)),
  };

  const agreementHandlers = {
    onAccept: (record: ArcAgreement) =>
      void run("Collateral matched.", () => acceptArcAgreement(record.id, record.token, record.collateral)),
    onDecline: (record: ArcAgreement) => void run("Agreement settled at the decline split.", () => declineArcAgreement(record.id)),
    onDispute: (record: ArcAgreement) => void run("Dispute opened.", () => disputeArcAgreement(record.id)),
    onCancel: (record: ArcAgreement) => void run("Agreement cancelled and refunded.", () => cancelArcAgreement(record.id)),
    onExpire: (record: ArcAgreement) => void run("Agreement expired and refunded.", () => expireArcAgreement(record.id)),
    onTimeout: (record: ArcAgreement) => void run("Agreement settled at the timeout split.", () => timeoutArcAgreement(record.id)),
  };

  async function handleCreateBounty(draft: BountyDraft) {
    await run("Bounty funded.", async () => {
      const created = await createArcBounty(draft);
      setBountyDialogOpen(false);
      return created.hash;
    });
  }

  async function handleCreateAgreement(draft: ArcAgreementInput & { title: string }) {
    await run("Agreement funded.", async () => {
      const created = await createArcAgreement(draft);
      setAgreementDialogOpen(false);
      return created.hash;
    });
  }

  async function handleSubmitDelivery(record: ArcBounty, delivery: string) {
    await run("Delivery committed.", async () => {
      const hash = await submitArcBounty(record.id, delivery);
      setSubmissionRecord(null);
      return hash;
    });
  }

  const filterOptions = mode === "points" ? AGREEMENT_FILTERS : BOUNTY_FILTERS;
  const activeFilter = mode === "points" ? agreementFilter : bountyFilter;
  const setActiveFilter = (value: string) =>
    mode === "points"
      ? setAgreementFilter(value as (typeof AGREEMENT_FILTERS)[number])
      : setBountyFilter(value as (typeof BOUNTY_FILTERS)[number]);

  return (
    <div className="hanka-app market-page min-h-screen">
      <ArcHeader onRefresh={() => void refresh()} refreshing={loading} />

      <section className="arc-market-intro relative overflow-hidden">
        <img className="arc-market-intro-underlay" src={OPERA_UNDERLAY_URL} alt="" aria-hidden="true" />
        <div className="market-shell relative flex flex-col justify-between gap-4 py-6 lg:flex-row lg:items-end">
          <div>
            <p className="hanka-kicker">ARC · SOCIAL PROOF EXCHANGE</p>
            <h1 className="mt-2 max-w-2xl font-display text-4xl tracking-[-.07em] sm:text-5xl">Fund proof. Settle onchain.</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--hanka-muted)]">
              One shared dashboard for bounties, source offers, and equal-collateral airdrop agreements on Arc. Every
              record below is read from the public contract — no sample bounties are invented.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setBountyDialogOpen(true)} disabled={!wallet || busy}>
              <Plus className="size-4" />
              CREATE BOUNTY
            </Button>
            <Button variant="outline" onClick={() => setAgreementDialogOpen(true)} disabled={!wallet || busy}>
              NEW POINT EXCHANGE
            </Button>
          </div>
        </div>
      </section>

      <main className="market-shell py-6">
        {error ? (
          <div className="hanka-banner hanka-banner-error mb-5">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Could not read Arc Testnet.</p>
              <p className="mt-1">{error}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void refresh()}>
                Try again
              </Button>
            </div>
          </div>
        ) : null}

        {snapshot?.paused ? (
          <div className="hanka-banner hanka-banner-warn mb-5">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p>The market contract is paused. Existing records can still be settled, but new ones cannot be created.</p>
          </div>
        ) : null}

        {wallet && !onArcNetwork ? (
          <div className="hanka-banner hanka-banner-warn mb-5">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="flex-1">
              <p>Your wallet is not on Arc Testnet, so transactions will be rejected.</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void switchToArc()}>
                Switch to Arc Testnet
              </Button>
            </div>
          </div>
        ) : null}

        <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="hanka-stat">
            <p className="hanka-stat-label">Value in escrow</p>
            <p className="hanka-stat-value">{unread ? "—" : stats.escrowed}</p>
            <p className="hanka-stat-note">Held by the contract for live records</p>
          </div>
          <div className="hanka-stat">
            <p className="hanka-stat-label">Open bounties</p>
            <p className="hanka-stat-value">{count(stats.openBounties)}</p>
            <p className="hanka-stat-note">{count(stats.liveBounties)} in the lifecycle</p>
          </div>
          <div className="hanka-stat">
            <p className="hanka-stat-label">Live agreements</p>
            <p className="hanka-stat-value">{count(stats.liveAgreements)}</p>
            <p className="hanka-stat-note">{count(agreements.length)} total onchain</p>
          </div>
          <div className="hanka-stat">
            <p className="hanka-stat-label">Settled records</p>
            <p className="hanka-stat-value">{count(stats.settled)}</p>
            <p className="hanka-stat-note">Paid, refunded, or resolved</p>
          </div>
          <div className="hanka-stat">
            <p className="hanka-stat-label">{wallet ? "Your records" : "Protocol fee"}</p>
            <p className="hanka-stat-value">{wallet ? count(mine.bounties.length + mine.agreements.length) : unread ? "—" : feePercent(snapshot.defaultFeeBps)}</p>
            <p className="hanka-stat-note">
              {wallet ? `${walletEscrowed ?? "—"} escrowed by you` : "Snapshotted onto each record at creation"}
            </p>
          </div>
        </section>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          {MODES.map(item => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={mode === item.id}
              className="hanka-tab"
              onClick={() => setMode(item.id)}
            >
              {item.label}
            </button>
          ))}
          <div className="relative ml-auto flex w-full items-center gap-2 sm:w-auto">
            <Search className="pointer-events-none absolute left-2.5 size-4 text-[var(--hanka-muted)]" />
            <Input
              className="hanka-search-input pl-8 sm:w-56"
              placeholder="Search id, wallet, hash"
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <select className="hanka-input sm:w-40" value={activeFilter} onChange={event => setActiveFilter(event.target.value)}>
              {filterOptions.map(option => (
                <option key={option} value={option}>
                  {option === "all" ? "All states" : option[0].toUpperCase() + option.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid gap-4">
            {loading && !snapshot ? (
              <div className="hanka-panel p-8 text-center">
                <Loader2 className="mx-auto size-5 animate-spin text-[var(--hanka-accent)]" />
                <p className="mt-3 text-sm text-[var(--hanka-muted)]">Reading Arc Testnet…</p>
              </div>
            ) : null}

            {mode === "bounties" ? (
              <>
                {visibleBounties.map(record => (
                  <BountyCard key={`bounty-${record.id}`} record={record} wallet={wallet} handlers={bountyHandlers} busy={busy} context={actionContext} />
                ))}
                {!loading && !unread && visibleBounties.length === 0 ? (
                  <EmptyState
                    title={bounties.length ? "No matching funded bounties." : "No bounties funded yet."}
                    text="This board reads public Arc state. No sample bounties are invented."
                  />
                ) : null}
              </>
            ) : null}

            {mode === "points" ? (
              <>
                {visibleAgreements.map(record => (
                  <AgreementCard key={`agreement-${record.id}`} record={record} wallet={wallet} handlers={agreementHandlers} busy={busy} context={actionContext} />
                ))}
                {!loading && !unread && visibleAgreements.length === 0 ? (
                  <EmptyState
                    title={agreements.length ? "No matching agreements." : "No point exchange agreements yet."}
                    text="Airdrop outcome agreements name one counterparty and escrow equal collateral on both sides."
                  />
                ) : null}
              </>
            ) : null}

            {mode === "activity" ? (
              !wallet ? (
                <EmptyState title="Connect a wallet to see your activity." text="Only records where your connected EVM wallet is a party are shown here." />
              ) : (
                <>
                  <LedgerSection
                    title="Active bounties"
                    empty="No bounties in flight for this wallet."
                    records={visibleBounties.filter(record => !isBountyClosed(record))}
                    render={record => <BountyCard key={`mine-b-${record.id}`} record={record} wallet={wallet} handlers={bountyHandlers} busy={busy} context={actionContext} />}
                  />
                  <LedgerSection
                    title="Completed bounties"
                    empty="Nothing settled yet."
                    records={visibleBounties.filter(isBountyClosed)}
                    render={record => <BountyCard key={`mine-bc-${record.id}`} record={record} wallet={wallet} handlers={{}} busy={busy} />}
                  />
                  <LedgerSection
                    title="Active exchanges"
                    empty="No open or funded agreements for this wallet."
                    records={visibleAgreements.filter(record => !isAgreementClosed(record))}
                    render={record => <AgreementCard key={`mine-a-${record.id}`} record={record} wallet={wallet} handlers={agreementHandlers} busy={busy} context={actionContext} />}
                  />
                  <LedgerSection
                    title="Completed exchanges"
                    empty="Nothing settled yet."
                    records={visibleAgreements.filter(isAgreementClosed)}
                    render={record => <AgreementCard key={`mine-ac-${record.id}`} record={record} wallet={wallet} handlers={{}} busy={busy} />}
                  />
                </>
              )
            ) : null}
          </div>

          <aside className="grid content-start gap-4">
            <div className="hanka-panel p-4">
              <p className="hanka-kicker">NETWORK</p>
              <dl className="mt-3 grid gap-2 text-sm">
                <StatusRow term="Chain" value="Arc Testnet · 5042002" />
                <StatusRow term="Contract type" value={snapshot ? ARC_DIALECT_LABEL[snapshot.dialect] : "—"} />
                <StatusRow
                  term="Contract"
                  value={contractAddress ? shortAddress(contractAddress) : "Not configured"}
                  href={contractAddress ? arcExplorerAddress(contractAddress) : undefined}
                />
                <StatusRow term="Resolver" value={arbiter ? shortAddress(arbiter) : unread ? "—" : "Not published"} href={arbiter ? arcExplorerAddress(arbiter) : undefined} />
                <StatusRow term="Protocol fee" value={unread ? "—" : feePercent(snapshot.defaultFeeBps)} />
                <StatusRow term="RPC endpoints" value={`${rpcUrls.length} configured`} />
                <StatusRow
                  term="Last read"
                  value={snapshot ? new Date(snapshot.scannedAt).toLocaleTimeString() : error ? "Failed" : "Loading…"}
                />
              </dl>
              <p className="hanka-field-hint mt-3">
                Chain reads go through this app's own origin first, then fall back to public Arc endpoints.
              </p>
            </div>

            <div className="hanka-panel p-4">
              <p className="hanka-kicker">HOW SETTLEMENT WORKS</p>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--hanka-muted)]">
                <li>A requester escrows the reward when the bounty is funded.</li>
                <li>One claimant accepts, delivers, and commits a delivery hash.</li>
                <li>The requester releases the reward, or anyone can release it once the review deadline passes.</li>
                <li>Either party can open a dispute; only the configured onchain resolver can settle it.</li>
              </ul>
              <p className="hanka-field-hint mt-3">
                The contract stores commitment hashes, not brief text. Testnet tokens have no financial value.
              </p>
            </div>

            <div className="hanka-panel flex items-center gap-3 p-4">
              <span className="arc-mark-tile arc-mark-tile-small">
                <img src={ARC_MARK_URL} alt="" aria-hidden="true" />
              </span>
              <p className="text-xs leading-5 text-[var(--hanka-muted)]">Built on Arc. Settlement is ERC-20 only; this contract never custodies native value.</p>
            </div>
          </aside>
        </div>
      </main>

      <div className="mobile-action-dock sm:hidden">
        <button type="button" className="mobile-action-buy" onClick={() => setBountyDialogOpen(true)} disabled={!wallet || busy}>
          <Plus className="size-4" />
          Bounty
        </button>
        <button type="button" onClick={() => setAgreementDialogOpen(true)} disabled={!wallet || busy}>
          Exchange
        </button>
        <button type="button" onClick={() => setMode("activity")}>
          Activity
        </button>
      </div>

      <BountyCreateDialog
        open={bountyDialogOpen}
        onOpenChange={setBountyDialogOpen}
        tokens={tokens}
        busy={busy}
        showReviewWindow={capabilities.has("bountyReviewWindow")}
        onSubmit={handleCreateBounty}
      />
      <AgreementCreateDialog
        open={agreementDialogOpen}
        onOpenChange={setAgreementDialogOpen}
        tokens={tokens}
        busy={busy}
        showPayoutSplits={capabilities.has("agreementPayoutSplits")}
        onSubmit={handleCreateAgreement}
      />
      <BountySubmissionDialog
        record={submissionRecord}
        deliverables={[]}
        busy={busy}
        onOpenChange={open => {
          if (!open) setSubmissionRecord(null);
        }}
        onSubmit={handleSubmitDelivery}
      />
    </div>
  );
}

function StatusRow({ term, value, href }: { term: string; value: string; href?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="hanka-record-term">{term}</dt>
      <dd className="text-right text-sm font-semibold">
        {href ? (
          <a className="inline-flex items-center gap-1 hover:text-[var(--hanka-accent)]" href={href} target="_blank" rel="noopener noreferrer">
            {value}
            <ExternalLink className="size-3" />
          </a>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function LedgerSection<T>({ title, empty, records, render }: { title: string; empty: string; records: T[]; render: (record: T) => ReactElement }) {
  return (
    <section className="grid gap-3">
      <h2 className="hanka-kicker">{title}</h2>
      {records.length ? records.map(render) : <p className="hanka-panel p-4 text-sm text-[var(--hanka-muted)]">{empty}</p>}
    </section>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="hanka-panel p-8 text-center">
      <h2 className="font-display text-2xl tracking-[-.05em]">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--hanka-muted)]">{text}</p>
    </div>
  );
}
