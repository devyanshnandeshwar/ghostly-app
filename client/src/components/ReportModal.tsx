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

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string, description: string) => void;
}

const REASONS = ["Harassment", "Hate Speech", "Sexual Content", "Spam/Bot", "Other"];
const DESCRIPTION_LIMIT = 200;

export default function ReportModal({ isOpen, onClose, onSubmit }: ReportModalProps) {
  const [reason, setReason] = useState(REASONS[0]);
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = () => {
    setIsSubmitting(true);
    onSubmit(reason, description);
    setIsSubmitting(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
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
            <RadioGroup value={reason} onValueChange={setReason} className="gap-1">
              {REASONS.map((r) => (
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
              placeholder="What they said or did"
              className="min-h-20 resize-none"
            />
            <p className="text-right font-mono text-xs tabular-nums text-muted-foreground">
              {description.length}/{DESCRIPTION_LIMIT}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? "Sending" : "Send report"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
