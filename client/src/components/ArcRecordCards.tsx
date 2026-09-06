import { Button } from "@/components/ui/button";
import {
  agreementTone,
  bountyTone,
  feePercent,
  formatDeadline,
  formatRelative,
  formatTokenAmount,
  netBountyPayout,
  shortAddress,
  shortHash,
  toneClass,
} from "@/lib/arcFormat";
import { ZERO_ADDRESS, arcProofTypeLabel, sameAddress, type ArcAgreement, type ArcBounty } from "@/lib/arcTestnet";
import {
  agreementActions,
  bountyActions,
  type ActionContext,
  type AgreementActionHandlers,
  type BountyActionHandlers,
  type RecordAction,
} from "@/lib/arcRecordActions";
import type { Address } from "viem";

export type { AgreementActionHandlers, BountyActionHandlers, RecordAction };
export { agreementActions, bountyActions };

type Field = { term: string; value: string };

function RecordShell({
  title,
  badges,
  fields,
  actions,
  footnote,
  busy,
}: {
  title: string;
  badges: Array<{ label: string; className: string }>;
  fields: Field[];
  actions: RecordAction[];
  footnote?: string;
  busy?: boolean;
}) {
  return (
    <article className="hanka-record">
      <div className="hanka-record-head">
        <h3 className="hanka-record-title">{title}</h3>
        {badges.map(badge => (
          <span key={badge.label} className={badge.className}>
            {badge.label}
          </span>
        ))}
      </div>
      <div className="hanka-record-grid">
        {fields.map(field => (
          <div key={field.term}>
            <p className="hanka-record-term">{field.term}</p>
            <p className="hanka-record-value">{field.value}</p>
          </div>
        ))}
      </div>
      {footnote ? <p className="hanka-field-hint">{footnote}</p> : null}
      {actions.length ? (
        <div className="hanka-record-actions">
          {actions.map(action => (
            <Button
              key={action.id}
              size="sm"
              variant={action.primary ? "default" : "outline"}
              disabled={busy}
              title={action.hint}
              onClick={() => void action.run()}
            >
              {action.label}
            </Button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function BountyCard({
  record,
  wallet,
  handlers,
  busy,
  title,
  context,
}: {
  record: ArcBounty;
  wallet: Address | null;
  handlers: BountyActionHandlers;
  busy?: boolean;
  title?: string;
  context?: ActionContext;
}) {
  const isRequester = sameAddress(record.requester, wallet);
  const isTaker = sameAddress(record.taker, wallet);
  const badges = [
    { label: record.stateLabel, className: toneClass(bountyTone(record.state)) },
    { label: record.kind === 1 ? `SOCIAL · ${arcProofTypeLabel(record.proofType)}` : "GENERAL", className: "hanka-chip" },
  ];
  if (isRequester) badges.push({ label: "You requested", className: "hanka-chip hanka-chip-open" });
  else if (isTaker) badges.push({ label: "You claimed", className: "hanka-chip hanka-chip-live" });

  const fields: Field[] = [
    { term: "Reward", value: formatTokenAmount(record.reward, record.tokenDecimals, record.tokenSymbol) },
    { term: "Net to claimant", value: formatTokenAmount(netBountyPayout(record), record.tokenDecimals, record.tokenSymbol) },
    { term: "Protocol fee", value: feePercent(record.feeBpsSnapshot) },
    { term: "Accept by", value: `${formatDeadline(record.acceptBy)} (${formatRelative(record.acceptBy)})` },
    { term: "Due", value: `${formatDeadline(record.dueAt)} (${formatRelative(record.dueAt)})` },
    ...(record.reviewBy > BigInt(0) ? [{ term: "Review by", value: formatDeadline(record.reviewBy) }] : []),
    { term: "Requester", value: shortAddress(record.requester) },
    { term: "Claimant", value: record.taker === ZERO_ADDRESS ? "Unclaimed" : shortAddress(record.taker) },
  ];
  if (record.retentionBond > BigInt(0)) {
    fields.push({ term: "Retention bond", value: formatTokenAmount(record.retentionBond, record.tokenDecimals, record.tokenSymbol) });
  }

  return (
    <RecordShell
      title={title ?? `Bounty #${record.id}`}
      badges={badges}
      fields={fields}
      actions={bountyActions(record, wallet, handlers, context)}
      busy={busy}
      footnote={`Terms commitment ${shortHash(record.termsHash)} — the contract stores this hash, not the brief text.`}
    />
  );
}

export function AgreementCard({
  record,
  wallet,
  handlers,
  busy,
  context,
}: {
  record: ArcAgreement;
  wallet: Address | null;
  handlers: AgreementActionHandlers;
  busy?: boolean;
  context?: ActionContext;
}) {
  const isMaker = sameAddress(record.maker, wallet);
  const badges = [
    { label: record.stateLabel, className: toneClass(agreementTone(record.state)) },
    { label: "POINT EXCHANGE", className: "hanka-chip" },
  ];
  if (isMaker) badges.push({ label: "You opened", className: "hanka-chip hanka-chip-open" });
  else if (sameAddress(record.taker, wallet)) badges.push({ label: "Named counterparty", className: "hanka-chip hanka-chip-live" });

  const fields: Field[] = [
    { term: "Collateral each", value: formatTokenAmount(record.collateral, record.tokenDecimals, record.tokenSymbol) },
    { term: "Pooled", value: formatTokenAmount(record.collateral * BigInt(2), record.tokenDecimals, record.tokenSymbol) },
    { term: "Protocol fee", value: feePercent(record.feeBpsSnapshot) },
    { term: "Accept by", value: `${formatDeadline(record.acceptBy)} (${formatRelative(record.acceptBy)})` },
    { term: "Settle by", value: `${formatDeadline(record.settlementBy)} (${formatRelative(record.settlementBy)})` },
    { term: "Maker", value: shortAddress(record.maker) },
    { term: "Counterparty", value: shortAddress(record.taker) },
    ...(record.makerDeclinePayoutBps || record.makerTimeoutPayoutBps
      ? [{ term: "Decline / timeout split", value: `${record.makerDeclinePayoutBps / 100}% / ${record.makerTimeoutPayoutBps / 100}% to maker` }]
      : []),
  ];

  return (
    <RecordShell
      title={`Agreement #${record.id}`}
      badges={badges}
      fields={fields}
      actions={agreementActions(record, wallet, handlers, context)}
      busy={busy}
      footnote={`Terms commitment ${shortHash(record.termsHash)}. This is an agreement on an uncertain outcome, not an oracle or promise of future airdrop value.`}
    />
  );
}
