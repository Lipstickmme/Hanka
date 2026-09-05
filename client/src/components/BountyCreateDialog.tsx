import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { futureLocalInput, toUnixSeconds } from "@/lib/arcFormat";
import { toTokenUnits, type ArcBountyInput } from "@/lib/arcTestnet";
import { Loader2, Plus, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Address } from "viem";

export type BountyDraft = ArcBountyInput & { title: string };

type TokenOption = { symbol: string; address: string; decimals: number };

type BountyCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokens: TokenOption[];
  busy?: boolean;
  onSubmit: (draft: BountyDraft) => Promise<void>;
};

const MAX_DELIVERABLE_LENGTH = 100;

/**
 * Funds a general bounty.
 *
 * The brief the user types is hashed into the onchain terms commitment, so the
 * copy is careful not to imply the contract stores or verifies the text itself.
 */
export function BountyCreateDialog({ open, onOpenChange, tokens, busy = false, onSubmit }: BountyCreateDialogProps) {
  const [token, setToken] = useState(tokens[0]?.address ?? "");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [deliverables, setDeliverables] = useState<string[]>([""]);
  const [reward, setReward] = useState("5");
  const [acceptBy, setAcceptBy] = useState(() => futureLocalInput(2));
  const [dueAt, setDueAt] = useState(() => futureLocalInput(7));
  const [reviewBy, setReviewBy] = useState(() => futureLocalInput(10));
  const [attested, setAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedToken = useMemo(
    () => tokens.find(item => item.address.toLowerCase() === token.toLowerCase()) ?? tokens[0],
    [token, tokens],
  );

  const filledDeliverables = deliverables.map(item => item.trim()).filter(Boolean);
  const ready = Boolean(selectedToken) && title.trim().length >= 3 && summary.trim().length >= 8 && filledDeliverables.length > 0 && attested;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedToken) {
      toast.error("No token is allowlisted by the market contract yet.");
      return;
    }
    setSubmitting(true);
    try {
      const terms = [
        "HANKA Arc Testnet bounty",
        `Title: ${title.trim()}`,
        `Summary: ${summary.trim()}`,
        `Deliverables: ${filledDeliverables.map((item, index) => `${index + 1}. ${item}`).join(" | ")}`,
        "Winners: 1 (current contract limit)",
        "Safety attestation: no illegal, exploitative, prohibited, or misrepresented work is requested.",
        "Reward is held by the HANKA market contract and releases only through its bounty lifecycle.",
      ].join("\n");

      await onSubmit({
        token: selectedToken.address as Address,
        reward: toTokenUnits(reward, selectedToken.decimals),
        acceptBy: toUnixSeconds(acceptBy, "Accept deadline"),
        dueAt: toUnixSeconds(dueAt, "Due date"),
        reviewBy: toUnixSeconds(reviewBy, "Review deadline"),
        terms,
        metadata: `${title.trim()}::${summary.trim()}`,
        title: title.trim(),
      });
      setTitle("");
      setSummary("");
      setDeliverables([""]);
      setAttested(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The bounty could not be created.");
    } finally {
      setSubmitting(false);
    }
  }

  const pending = submitting || busy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="hanka-app max-h-[88vh] max-w-xl overflow-y-auto border-[var(--hanka-line)] bg-[var(--hanka-panel)]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-[-.05em]">Bounty details</DialogTitle>
          <DialogDescription className="text-[var(--hanka-muted)]">
            Your wallet approves the exact reward and the contract escrows it until you release it or the lifecycle
            times out.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          <div>
            <label className="hanka-label" htmlFor="bounty-title">
              Title *
            </label>
            <Input id="bounty-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="What needs doing?" maxLength={50} />
          </div>

          <div>
            <label className="hanka-label" htmlFor="bounty-summary">
              Summary *
            </label>
            <Textarea id="bounty-summary" value={summary} onChange={event => setSummary(event.target.value)} placeholder="Context a claimant needs before accepting." maxLength={500} />
          </div>

          <div>
            <p className="hanka-label">Deliverables *</p>
            <div className="grid gap-2">
              {deliverables.map((item, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={item}
                    maxLength={MAX_DELIVERABLE_LENGTH}
                    placeholder={`Deliverable ${index + 1}`}
                    onChange={event => setDeliverables(current => current.map((value, position) => (position === index ? event.target.value : value)))}
                  />
                  {deliverables.length > 1 ? (
                    <Button type="button" variant="outline" size="icon" aria-label="Remove deliverable" onClick={() => setDeliverables(current => current.filter((_, position) => position !== index))}>
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" disabled={deliverables.length >= 10} onClick={() => setDeliverables(current => [...current, ""])}>
                <Plus className="size-3.5" />
                Add deliverable
              </Button>
              <span className="hanka-field-hint">{MAX_DELIVERABLE_LENGTH} characters max each</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="hanka-label" htmlFor="bounty-reward">
                Reward
              </label>
              <Input id="bounty-reward" type="number" min="0.000001" step="any" value={reward} onChange={event => setReward(event.target.value)} />
            </div>
            <div>
              <label className="hanka-label" htmlFor="bounty-token">
                Token
              </label>
              <select id="bounty-token" className="hanka-input" value={token} onChange={event => setToken(event.target.value)}>
                {tokens.map(option => (
                  <option key={option.address} value={option.address}>
                    {option.symbol}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="hanka-label" htmlFor="bounty-accept">
                Accept by
              </label>
              <Input id="bounty-accept" type="datetime-local" value={acceptBy} onChange={event => setAcceptBy(event.target.value)} />
            </div>
            <div>
              <label className="hanka-label" htmlFor="bounty-due">
                Due
              </label>
              <Input id="bounty-due" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} />
            </div>
            <div>
              <label className="hanka-label" htmlFor="bounty-review">
                Review by
              </label>
              <Input id="bounty-review" type="datetime-local" value={reviewBy} onChange={event => setReviewBy(event.target.value)} />
            </div>
          </div>
          <p className="hanka-field-hint">
            The contract requires these to run forward: accept, then due, then review. After the review deadline the
            reward can be released to the claimant by anyone.
          </p>

          <label className="flex gap-2 text-sm leading-5 text-[var(--hanka-muted)]">
            <input type="checkbox" className="mt-1 size-4" checked={attested} onChange={event => setAttested(event.target.checked)} />
            <span>
              I confirm this brief does not request illegal, exploitative, prohibited, or misrepresented work. Multi-winner
              reward splits are not available on this contract; one claimant is paid. Files are not uploaded to the
              contract or to HANKA storage — only a hash of this brief is committed onchain.
            </span>
          </label>

          <Button type="submit" disabled={!ready || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            APPROVE AND FUND BOUNTY
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
