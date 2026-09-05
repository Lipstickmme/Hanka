import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ArcBounty } from "@/lib/arcTestnet";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

type BountySubmissionDialogProps = {
  record: ArcBounty | null;
  deliverables: string[];
  busy?: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (record: ArcBounty, delivery: string) => Promise<void>;
};

/**
 * Commits a delivery hash for an accepted bounty.
 *
 * The evidence text is hashed, never uploaded: the contract stores 32 bytes, so
 * the copy says so rather than implying HANKA holds the claimant's files.
 */
export function BountySubmissionDialog({ record, deliverables, busy = false, onOpenChange, onSubmit }: BountySubmissionDialogProps) {
  const [complete, setComplete] = useState<boolean[]>([]);
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState<string[]>([""]);
  const [attested, setAttested] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setComplete(deliverables.map(() => false));
    setDescription("");
    setLinks([""]);
    setAttested(false);
  }, [record?.id, deliverables.length]);

  const allComplete = deliverables.length === 0 || complete.every(Boolean);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!record) return;
    setSubmitting(true);
    try {
      const evidenceLinks = links.map(link => link.trim()).filter(Boolean);
      const delivery = [
        "HANKA bounty delivery submission",
        `Bounty: #${record.id}`,
        deliverables.length ? `Deliverables confirmed: ${deliverables.map((item, index) => `${index + 1}. ${item}${complete[index] ? " (done)" : ""}`).join(" | ")}` : "Deliverables: as agreed in the bounty terms",
        `Evidence: ${description.trim()}`,
        evidenceLinks.length ? `Links: ${evidenceLinks.join(" | ")}` : "Links: none",
        "Content attestation: this delivery is my own work and accurately describes what was delivered.",
      ].join("\n");
      await onSubmit(record, delivery);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The delivery could not be submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  const pending = submitting || busy;

  return (
    <Dialog open={Boolean(record)} onOpenChange={onOpenChange}>
      <DialogContent className="hanka-app max-h-[88vh] max-w-lg overflow-y-auto border-[var(--hanka-line)] bg-[var(--hanka-panel)]">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-[-.05em]">Confirm deliverables</DialogTitle>
          <DialogDescription className="text-[var(--hanka-muted)]">
            Your wallet signs a commitment to this delivery. HANKA does not upload files or publish your full evidence
            text onchain — only its hash is stored.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="grid gap-4">
          {deliverables.length ? (
            <div className="grid gap-2">
              {deliverables.map((item, index) => (
                <label key={index} className="flex gap-2 text-sm leading-5">
                  <input
                    type="checkbox"
                    className="mt-1 size-4"
                    checked={complete[index] ?? false}
                    onChange={event => setComplete(current => current.map((value, position) => (position === index ? event.target.checked : value)))}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="hanka-field-hint">
              This bounty's deliverables live in its terms commitment. Describe exactly what you delivered below.
            </p>
          )}

          <div>
            <label className="hanka-label" htmlFor="delivery-description">
              Explain what you delivered.
            </label>
            <Textarea id="delivery-description" value={description} onChange={event => setDescription(event.target.value)} maxLength={1200} />
          </div>

          <div>
            <p className="hanka-label">Evidence links</p>
            <div className="grid gap-2">
              {links.map((link, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={link}
                    placeholder="https://…"
                    spellCheck={false}
                    onChange={event => setLinks(current => current.map((value, position) => (position === index ? event.target.value : value)))}
                  />
                  {links.length > 1 ? (
                    <Button type="button" variant="outline" size="icon" aria-label="Remove link" onClick={() => setLinks(current => current.filter((_, position) => position !== index))}>
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2" disabled={links.length >= 6} onClick={() => setLinks(current => [...current, ""])}>
              <Plus className="size-3.5" />
              ADD LINK
            </Button>
            <p className="hanka-field-hint">Links are part of the hashed commitment; no file is uploaded anywhere.</p>
          </div>

          <label className="flex gap-2 text-sm leading-5 text-[var(--hanka-muted)]">
            <input type="checkbox" className="mt-1 size-4" checked={attested} onChange={event => setAttested(event.target.checked)} />
            <span>I confirm this delivery is my own work and accurately describes what was delivered.</span>
          </label>

          <Button type="submit" disabled={!allComplete || !description.trim() || !attested || pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            SUBMIT DELIVERY HASH
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
