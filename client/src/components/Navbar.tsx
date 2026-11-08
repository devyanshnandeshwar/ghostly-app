import { AlertTriangle, Ghost } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import { useSession } from "../context/SessionContext";
import { useCountdown } from "../hooks/useCountdown";

interface NavbarProps {
  onLogoClick?: () => void;
}

export function Navbar({ onLogoClick }: NavbarProps) {
  const { session } = useSession();
  const timeLeft = useCountdown(session?.filtersResetInSeconds);

  const isLoggedIn = Boolean(session?.isVerified && session?.nickname);
  // Both numbers come from the server. Deriving them here needed a local copy
  // of the allowance, and a second copy is how this pill came to contradict the
  // server it was reporting on.
  const filtersLeft = session?.filtersRemaining ?? 0;
  const filtersTotal = session?.filtersTotal ?? 0;
  const filtersExhausted = session?.filtersRemaining !== undefined && filtersLeft === 0;
  const reportCount = session?.reportsAgainst || 0;

  return (
    <header className="glass sticky top-0 z-50 w-full border-b">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-6">
        <button
          type="button"
          onClick={onLogoClick}
          className="flex min-h-11 items-center gap-2.5 rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-primary/12">
            <Ghost className="size-4.5 text-primary" />
          </span>
          <span className="text-md font-semibold tracking-tight">Ghostly</span>
          <span className="sr-only">Back to start</span>
        </button>

        {isLoggedIn && (session?.filtersRemaining !== undefined || reportCount > 0) && <div className="order-2 flex w-full min-w-0 flex-wrap items-center gap-2 sm:order-none sm:ml-auto sm:w-auto">
          {isLoggedIn && session?.filtersRemaining !== undefined && (
            <span
              title={
                filtersExhausted
                  ? "Your gender filters are spent. Matching with Anyone is still open."
                  : "Filtered matches left in this 24-hour window"
              }
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                filtersExhausted
                  ? "border-transparent bg-secondary text-muted-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <span className="font-mono tabular-nums text-foreground">
                {filtersLeft}/{filtersTotal}
              </span>
              filters
              {filtersExhausted && timeLeft && (
                <span className="font-mono tabular-nums">· {timeLeft}</span>
              )}
            </span>
          )}

          {isLoggedIn && reportCount > 0 && (
            <span
              title={`${reportCount} report${reportCount === 1 ? "" : "s"} filed against you`}
              aria-label={`${reportCount} report${reportCount === 1 ? "" : "s"} filed against you`}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                reportCount > 2
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-secondary text-foreground"
              }`}
            >
              <AlertTriangle className="size-3" />
              {reportCount}
            </span>
          )}

        </div>}
        <div className="ml-auto"><ModeToggle /></div>
      </div>
    </header>
  );
}
