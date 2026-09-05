import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { futureLocalInput, toUnixSeconds } from "@/lib/arcFormat";
import { toTokenUnits, type ArcAgreementInput } from "@/lib/arcTestnet";
import { Loader2 } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { isAddress, type Address } from "viem";

type TokenOption = { symbol: string; address: string; decimals: number };

type AgreementCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokens: TokenOption[];
  busy?: boolean;
  onSubmit: (draft: ArcAgreementInput & { title: string }) => Promise<void>;
};

/**
 * Opens a named, equal-collateral agreement on an uncertain outcome.
 *
 * Both sides post the same collateral; the decline and timeout splits are fixed
 * onchain at creation so neither side can reinterpret them later.
 */
export function AgreementCreateDialog({ open, onOpenChange, tokens, busy = false, onSubmit }: AgreementCreateDialogProps) {
  const [token, setToken] = useState(tokens[0]?.address ?? "");
  const [counterparty, setCounterparty] = useState("");
  const [collateral, setCollateral] = useState("50");
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  const [acceptBy, setAcceptBy] = useState(() => futureLocalInput(2));
  const [settlementBy, setSettlementBy] = useState(() => futureLocalInput(14));
  const [declineBps, setDeclineBps] = useState("5000");
  const [timeoutBps, setTimeoutBps] = useState("5000");
  const [attested, setAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedToken = useMemo(
    () => tokens.find(item => item.address.toLowerCase() === token.toLowerCase()) ?? tokens[0],
    [token, tokens],
  );

  const ready =
    Boolean(selectedToken) && isAddress(counterparty.trim()) && title.trim().length >= 3 && terms.trim().length >= 8 && attested;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedToken) {
      toast.error("No token is allowlisted by the market contract yet.");
      return;
    }
    const decline = Number(declineBps);
    const timeout = Number(timeoutBps);
    if (!Number.isInteger(decline) || decline < 0 || decline > 10_000 || !Number.isInteger(timeout) || timeout < 0 || timeout > 10_000) {
      toast.error("Payout splits must be between 0 and 10000 basis points.");
      return;
    }
    setSubmitting(true);
    try {
      const termsText = [
        "HANKA Arc Testnet point exchange agreement",
        `Title: ${title.trim()}`,
        `Terms: ${terms.trim()}`,
        `Maker payout if declined: ${decline / 100}% of pooled collateral`,
        `Maker payout on settlement timeout: ${timeout / 100}% of pooled collateral`,
        "Both sides post equal collateral. This is an agreement on an uncertain outcome, not an oracle or promise of future airdrop value.",
        "Disputes are settled by the configured onchain resolver.",
      ].join("\n");

      await onSubmit({
        token: selectedToken.address as Address,
        taker: counterparty.trim() as Address,
        collateral: toTokenUnits(collateral, selectedToken.decimals),
        acceptBy: toUnixSeconds(acceptBy, "Accept deadline"),
        settlementBy: toUnixSeconds(settlementBy, "Settlement deadline"),
        makerDeclinePayoutBps: decline,
        makerTimeoutPayoutBps: timeout,
        terms: termsText,
        metadata: `${title.trim()}::${terms.trim()}`,
        title: title.trim(),
      });
      setTitle("");
      setTerms("");
      setCounterparty("");
      setAttested(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The agreement could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  const pending = submitting || busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hanka-app max-h-[88vh] max-w-xl overflow-y-auto border-[var(--hanka-line)] bg-[var(--hanka-panel)]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-[-.05em]">Airdrop outcome agreement</DialogTitle>
          <DialogDescription className="text-[var(--hanka-muted)]">
            Price the uncertainty. You name one counterparty, both sides escrow the same collateral, and the contract
            settles on the split you agree now.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <label className="hanka-label" htmlFor="agreement-title">
              Title *
            </label>
            <Input id="agreement-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="What outcome is being priced?" maxLength={60} />
          </div>

          <div>
            <label className="hanka-label" htmlFor="agreement-counterparty">
              Counterparty wallet *
            </label>
            <Input id="agreement-counterparty" value={counterparty} onChange={event => setCounterparty(event.target.value)} placeholder="0x…" spellCheck={false} />
            <p className="hanka-field-hint">Only this wallet can match the collateral. It cannot be your own address.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="hanka-label" htmlFor="agreement-collateral">
                Collateral each side
              </label>
              <Input id="agreement-collateral" type="number" min="0.000001" step="any" value={collateral} onChange={event => setCollateral(event.target.value)} />
            </div>
            <div>
              <label className="hanka-label" htmlFor="agreement-token">
                Token
              </label>
              <select id="agreement-token" className="hanka-input" value={token} onChange={event => setToken(event.target.value)}>
                {tokens.map(option => (
                  <option key={option.address} value={option.address}>
                    {option.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="hanka-label" htmlFor="agreement-accept">
                Accept by
              </label>
              <Input id="agreement-accept" type="datetime-local" value={acceptBy} onChange={event => setAcceptBy(event.target.value)} />
            </div>
            <div>
              <label className="hanka-label" htmlFor="agreement-settle">
                Settle by
              </label>
              <Input id="agreement-settle" type="datetime-local" value={settlementBy} onChange={event => setSettlementBy(event.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="hanka-label" htmlFor="agreement-decline">
                Maker share if declined (bps)
              </label>
              <Input id="agreement-decline" type="number" min="0" max="10000" step="1" value={declineBps} onChange={event => setDeclineBps(event.target.value)} />
            </div>
            <div>
              <label className="hanka-label" htmlFor="agreement-timeout">
                Maker share on timeout (bps)
              </label>
              <Input id="agreement-timeout" type="number" min="0" max="10000" step="1" value={timeoutBps} onChange={event => setTimeoutBps(event.target.value)} />
            </div>
          </div>
          <p className="hanka-field-hint">10000 basis points is the whole pooled collateral, less the protocol fee.</p>

          <div>
            <label className="hanka-label" htmlFor="agreement-terms">
              Terms *
            </label>
            <Textarea id="agreement-terms" value={terms} onChange={event => setTerms(event.target.value)} placeholder="What settles this agreement, and on what evidence?" maxLength={800} />
          </div>

          <label className="flex gap-2 text-sm leading-5 text-[var(--hanka-muted)]">
            <input type="checkbox" className="mt-1 size-4" checked={attested} onChange={event => setAttested(event.target.checked)} />
            <span>
              I understand the contract holds both collaterals and settles only through the splits above, a mutual
              settlement, or the configured onchain resolver. HANKA does not price, guarantee, or adjudicate the outcome.
            </span>
          </label>

          <Button type="submit" disabled={!ready || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            FUND AGREEMENT
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
