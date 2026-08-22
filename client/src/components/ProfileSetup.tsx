import { useState } from "react";
import { AlertCircle, ArrowRight, Lock } from "lucide-react";

import api from "../services/client";
import { useSession } from "../context/SessionContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface ProfileSetupProps {
  onComplete: () => void;
  /** Present when the user opened this to change an existing persona. */
  onCancel?: () => void;
}

const FREE_FILTERS_PER_DAY = 5;
const BIO_LIMIT = 120;

const PREFERENCES = [
  { value: "any", label: "Anyone", note: "Always free" },
  { value: "male", label: "Men", note: "Uses a filter" },
  { value: "female", label: "Women", note: "Uses a filter" },
] as const;

export function ProfileSetup({ onComplete, onCancel }: ProfileSetupProps) {
  const { session } = useSession();
  const [nickname, setNickname] = useState(session?.nickname === "Anonymous" ? "" : session?.nickname || "");
  const [bio, setBio] = useState(session?.bio || "");
  const [preference, setPreference] = useState<string>(session?.preference || "any");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const filtersUsed = session?.dailyFilterUsage ?? 0;
  const filtersLeft = Math.max(0, FREE_FILTERS_PER_DAY - filtersUsed);
  const filtersLocked = session?.dailyFilterUsage !== undefined && filtersLeft === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await api.post("/profile/update", {
        // Not sanitized here on purpose: xssMiddleware sanitizes every
        // request body server-side, and an attacker skips this UI anyway.
        nickname,
        bio,
        preference,
      });
      onComplete();
    } catch (err: any) {
      console.error("Profile update failed:", err);
      setError(err.response?.data?.error || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-6 elevation-mid sm:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">
          {onCancel ? "Edit your persona" : "Create your persona"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pick something that is not your real name. You can change it later.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
        <div className="space-y-2">
          <Label htmlFor="nickname">Nickname</Label>
          <Input
            id="nickname"
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="quietstorm"
            minLength={3}
            maxLength={20}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          <p id="nickname-hint" className="text-xs text-muted-foreground">
            3 to 20 characters. Strangers see this and nothing else.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="bio">Bio</Label>
            <span className="text-xs text-muted-foreground">Optional</span>
          </div>
          <Textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="min-h-24 resize-none"
            placeholder="here to talk about deep sea fish"
            maxLength={BIO_LIMIT}
          />
          <p className="text-right font-mono text-xs tabular-nums text-muted-foreground">
            {bio.length}/{BIO_LIMIT}
          </p>
        </div>

        <fieldset className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <legend className="text-sm font-medium">Match me with</legend>
            {session?.dailyFilterUsage !== undefined && (
              <span
                className={cn(
                  "font-mono text-xs tabular-nums",
                  filtersLocked ? "text-muted-foreground" : "text-primary"
                )}
              >
                {filtersLeft}/{FREE_FILTERS_PER_DAY} filters left
              </span>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Match me with">
            {PREFERENCES.map((option) => {
              const isLocked = option.value !== "any" && filtersLocked;
              const isSelected = preference === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  disabled={isLocked}
                  onClick={() => setPreference(option.value)}
                  title={isLocked ? "You have used today's gender filters" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-lg border px-2 py-3 text-sm transition-all duration-150",
                    "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    isSelected
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "text-foreground hover:bg-secondary",
                    isLocked && "cursor-not-allowed opacity-55 hover:bg-transparent"
                  )}
                >
                  <span className="flex items-center gap-1">
                    {isLocked && <Lock className="size-3" />}
                    {option.label}
                  </span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {isLocked ? "Locked today" : option.note}
                  </span>
                </button>
              );
            })}
          </div>

          {filtersLocked && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              You have used today's gender filters. Matching with anyone is still open, and
              the filters come back at midnight.
            </p>
          )}
        </fieldset>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Could not save</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="flex gap-2 pt-1">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} className="h-11">
              Cancel
            </Button>
          )}
          <Button
            type="submit"
            disabled={loading || nickname.trim().length < 3}
            className="h-11 flex-1 gap-2 text-base"
          >
            {loading ? "Saving" : onCancel ? "Save changes" : "Continue"}
            {!loading && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </form>
    </div>
  );
}
