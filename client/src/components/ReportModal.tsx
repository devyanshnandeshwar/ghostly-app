import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (reason: string, description: string) => void;
}

const REASONS = [
    "Harassment",
    "Hate Speech",
    "Sexual Content",
    "Spam/Bot",
    "Other"
];

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
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Report User
                    </DialogTitle>
                    <DialogDescription>
                        Please select a reason for reporting this user.
                    </DialogDescription>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                    <div className="space-y-4">
                        <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
                        <RadioGroup value={reason} onValueChange={setReason} className="grid grid-cols-1 gap-2">
                             {REASONS.map((r) => (
                                <div key={r} className="flex items-center space-x-2">
                                    <RadioGroupItem value={r} id={r} />
                                    <Label htmlFor={r} className="font-medium cursor-pointer flex-1 py-1">{r}</Label>
                                </div>
                            ))}
                        </RadioGroup>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="description" className="text-xs uppercase tracking-wider text-muted-foreground">Description (Optional)</Label>
                        <Textarea
                            id="description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            maxLength={200}
                            placeholder="Please provide more details..."
                            className="resize-none"
                        />
                        <div className="text-right text-xs text-muted-foreground">
                            {description.length}/200
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button variant="destructive" onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? "Submitting..." : "Submit Report"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
