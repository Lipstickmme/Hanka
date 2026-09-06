import { isPastDeadline } from "@/lib/arcFormat";
import {
  ARC_AGREEMENT_STATE,
  ARC_BOUNTY_STATE,
  arcCapabilities,
  sameAddress,
  type ArcAgreement,
  type ArcBounty,
  type ArcCapability,
} from "@/lib/arcTestnet";
import type { Address } from "viem";

/**
 * What the deployed contract can do. HankaArcEscrow has no review window, no
 * timeout exits and no retention bond, and offering those buttons against it
 * would send calls its catch-all fallback rejects. Defaults to the full
 * HankaMarketV2 set so a caller that has not resolved the dialect yet is not
 * silently stripped of every action.
 */
export type ActionContext = { capabilities?: ReadonlySet<ArcCapability>; now?: number };

const FULL_CAPABILITIES = arcCapabilities("v2");

export type RecordAction = {
  id: string;
  label: string;
  run: () => void | Promise<void>;
  primary?: boolean;
  hint?: string;
};

export type BountyActionHandlers = {
  onAccept?: (record: ArcBounty) => void;
  onSubmit?: (record: ArcBounty) => void;
  onApprove?: (record: ArcBounty) => void;
  onDispute?: (record: ArcBounty) => void;
  onCancel?: (record: ArcBounty) => void;
  onExpire?: (record: ArcBounty) => void;
  onTimeoutAccepted?: (record: ArcBounty) => void;
  onTimeoutSubmitted?: (record: ArcBounty) => void;
  onReleaseBond?: (record: ArcBounty) => void;
};

export type AgreementActionHandlers = {
  onAccept?: (record: ArcAgreement) => void;
  onDecline?: (record: ArcAgreement) => void;
  onDispute?: (record: ArcAgreement) => void;
  onCancel?: (record: ArcAgreement) => void;
  onExpire?: (record: ArcAgreement) => void;
  onTimeout?: (record: ArcAgreement) => void;
};

/**
 * The lifecycle actions this wallet may take on this bounty right now.
 *
 * Mirrors the guards in HankaMarketV2 — state, caller role and deadline — so the
 * UI never offers a button whose transaction the contract would revert. Kept
 * free of React so server/arc.record-actions.test.ts can exercise the real
 * decision table rather than grep the component that renders it.
 */
export function bountyActions(
  record: ArcBounty,
  wallet: Address | null,
  handlers: BountyActionHandlers,
  context: ActionContext = {},
): RecordAction[] {
  const { capabilities = FULL_CAPABILITIES, now = Date.now() } = context;
  const actions: RecordAction[] = [];
  const isRequester = sameAddress(record.requester, wallet);
  const isTaker = sameAddress(record.taker, wallet);
  const acceptExpired = isPastDeadline(record.acceptBy, now);
  const dueExpired = isPastDeadline(record.dueAt, now);
  const reviewExpired = isPastDeadline(record.reviewBy, now);

  if (record.state === ARC_BOUNTY_STATE.open) {
    // acceptBounty() rejects the requester and anything past acceptBy.
    if (!isRequester && wallet && !acceptExpired && handlers.onAccept) {
      actions.push({ id: "accept", label: "Accept bounty", primary: true, run: () => handlers.onAccept!(record) });
    }
    if (isRequester && handlers.onCancel) {
      actions.push({ id: "cancel", label: "Cancel & refund", run: () => handlers.onCancel!(record) });
    }
    if (acceptExpired && capabilities.has("bountyExpire") && handlers.onExpire) {
      actions.push({
        id: "expire",
        label: "Expire & refund",
        run: () => handlers.onExpire!(record),
        hint: "The accept deadline passed. Anyone can return the escrow to the requester.",
      });
    }
  }

  if (record.state === ARC_BOUNTY_STATE.accepted) {
    if (isTaker && !dueExpired && handlers.onSubmit) {
      actions.push({ id: "submit", label: "Submit delivery", primary: true, run: () => handlers.onSubmit!(record) });
    }
    if (dueExpired && capabilities.has("bountyTimeoutAccepted") && handlers.onTimeoutAccepted) {
      actions.push({ id: "timeout-accepted", label: "Close & refund", run: () => handlers.onTimeoutAccepted!(record) });
    }
  }

  if (record.state === ARC_BOUNTY_STATE.submitted) {
    if (isRequester && handlers.onApprove) {
      actions.push({ id: "approve", label: "Release reward", primary: true, run: () => handlers.onApprove!(record) });
    }
    if (reviewExpired && capabilities.has("bountyTimeoutSubmitted") && handlers.onTimeoutSubmitted) {
      actions.push({
        id: "timeout-submitted",
        label: "Release after review window",
        run: () => handlers.onTimeoutSubmitted!(record),
        hint: "The review deadline passed, so the reward can be released to the claimant.",
      });
    }
  }

  if (
    (record.state === ARC_BOUNTY_STATE.accepted || record.state === ARC_BOUNTY_STATE.submitted) &&
    (isRequester || isTaker) &&
    handlers.onDispute
  ) {
    actions.push({ id: "dispute", label: "Dispute", run: () => handlers.onDispute!(record) });
  }

  if (
    record.state === ARC_BOUNTY_STATE.retentionActive &&
    capabilities.has("retentionBond") &&
    isPastDeadline(record.retentionEndsAt, now) &&
    handlers.onReleaseBond
  ) {
    actions.push({ id: "release-bond", label: "Release retention bond", run: () => handlers.onReleaseBond!(record) });
  }

  return actions;
}

/** Agreement equivalent of `bountyActions`, matching the same contract guards. */
export function agreementActions(
  record: ArcAgreement,
  wallet: Address | null,
  handlers: AgreementActionHandlers,
  context: ActionContext = {},
): RecordAction[] {
  const { capabilities = FULL_CAPABILITIES, now = Date.now() } = context;
  const actions: RecordAction[] = [];
  const isMaker = sameAddress(record.maker, wallet);
  const isTaker = sameAddress(record.taker, wallet);
  const acceptExpired = isPastDeadline(record.acceptBy, now);
  const settlementExpired = isPastDeadline(record.settlementBy, now);

  if (record.state === ARC_AGREEMENT_STATE.open) {
    if (isTaker && !acceptExpired && handlers.onAccept) {
      actions.push({ id: "accept", label: "Match collateral", primary: true, run: () => handlers.onAccept!(record) });
    }
    if (isMaker && handlers.onCancel) {
      actions.push({ id: "cancel", label: "Cancel & refund", run: () => handlers.onCancel!(record) });
    }
    if (acceptExpired && capabilities.has("agreementExpire") && handlers.onExpire) {
      actions.push({ id: "expire", label: "Expire & refund", run: () => handlers.onExpire!(record) });
    }
  }

  if (record.state === ARC_AGREEMENT_STATE.funded) {
    if (isMaker && !settlementExpired && handlers.onDecline) {
      actions.push({
        id: "decline",
        label: "Settle at decline split",
        run: () => handlers.onDecline!(record),
        hint: capabilities.has("agreementPayoutSplits")
          ? `Pays the maker ${record.makerDeclinePayoutBps / 100}% of the pooled collateral, less fees.`
          : "Settles the exchange on this contract's decline terms, less fees.",
      });
    }
    if (settlementExpired && capabilities.has("agreementTimeout") && handlers.onTimeout) {
      actions.push({
        id: "timeout",
        label: "Settle at timeout split",
        run: () => handlers.onTimeout!(record),
        hint: `Pays the maker ${record.makerTimeoutPayoutBps / 100}% of the pooled collateral, less fees.`,
      });
    }
    if ((isMaker || isTaker) && handlers.onDispute) {
      actions.push({ id: "dispute", label: "Dispute", run: () => handlers.onDispute!(record) });
    }
  }

  return actions;
}
