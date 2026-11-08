import { useState } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { errorText } from "@/lib/apiError";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string, description: string) => void | Promise<void>;
  reasons: readonly string[];
}

const DESCRIPTION_LIMIT = 200;

export default function ReportModal({ isOpen, onClose, onSubmit, reasons }: ReportModalProps) {
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Radix unmounts DialogContent's children, but this component stays mounted,
  // so its state survived every close. Report someone for Harassment with a
  // note, skip to the next stranger, open Report again -- and the form was
  // pre-filled with what you wrote about the previous person, one click from
  // being sent about someone it does not describe.
  //
  // Reset during render via React's documented "adjusting state when a prop
  // changes" pattern, the same one useCountdown uses. An effect would paint the
  // stale values once before clearing them.
  const [wasOpen, setWasOpen] = useState(isOpen);

  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setReason("");
      setDescription("");
      setError(null);
    }
  }

  const handleSubmit = async () => {
    if (submitting || !reason) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(reason, description);
    } catch (err) {
      setError(errorText(err, "Could not submit that report. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-md" showCloseButton={!submitting}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" />
            Report this user
          </DialogTitle>
          <DialogDescription>
            Moderation sees the reason and your note. The conversation itself stays encrypted
            and is not attached.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">What happened</legend>
            <RadioGroup value={reason} onValueChange={setReason} disabled={submitting} className="gap-1" aria-label="What happened">
              {reasons.map((r) => (
                <Label
                  key={r}
                  htmlFor={r}
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 text-sm font-normal transition-colors hover:bg-secondary has-[button[data-state=checked]]:border-primary/40 has-[button[data-state=checked]]:bg-primary/8"
                >
                  <RadioGroupItem value={r} id={r} />
                  {r}
                </Label>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="description">Anything to add</Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_LIMIT}
              disabled={submitting}
              aria-describedby="report-description-hint"
              placeholder="What they said or did"
              className="min-h-20 resize-none"
            />
            <p id="report-description-hint" className="text-right font-mono text-xs tabular-nums text-muted-foreground">
              <span className="sr-only">Optional. </span>{description.length}/{DESCRIPTION_LIMIT}<span className="sr-only"> characters</span>
            </p>
          </div>
        </div>

        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        {submitting && <p role="status" className="text-sm text-muted-foreground">Waiting for the server to confirm your report.</p>}

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleSubmit()} disabled={submitting || !reason}>
            {submitting ? "Sending report" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
