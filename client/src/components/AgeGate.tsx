import { useState } from "react";
import { AlertCircle, ShieldCheck } from "lucide-react";

import api from "../services/client";
import { apiErrorMessage } from "@/lib/apiError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface AgeGateProps {
  onConfirmed: () => void;
}

/**
 * Self-declared age. Deliberately not dressed up as verification -- the copy
 * says what it is, because claiming more than a date field can deliver would be
 * the same mistake as the encryption badge.
 */
export function AgeGate({ onConfirmed }: AgeGateProps) {
  const [birthDate, setBirthDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post("/session/age", { birthDate });
      onConfirmed();
    } catch (err) {
      setError(apiErrorMessage(err, "We could not confirm your age. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  // Nobody using this is younger than the minimum, so the picker should not
  // offer dates that will only be rejected.
  const latest = new Date();
  latest.setFullYear(latest.getFullYear() - 18);

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-6 elevation-mid sm:p-8">
      <div className="mb-6 flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-primary/12 text-primary">
          <ShieldCheck className="size-4.5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold">Confirm your age</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Ghostly is for adults only. You must be 18 or over to use it.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="birthDate">Date of birth</Label>
          <Input
            id="birthDate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            max={latest.toISOString().slice(0, 10)}
            required
            aria-describedby="birthDate-hint"
          />
          <p id="birthDate-hint" className="text-xs text-muted-foreground">
            We store this to record that you confirmed it. Nobody you match with sees it.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Could not continue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          type="submit"
          disabled={loading || !birthDate}
          className="h-11 w-full text-base"
        >
          {loading ? "Confirming" : "I am 18 or over"}
        </Button>
      </form>
    </div>
  );
}
