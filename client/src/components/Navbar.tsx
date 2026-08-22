import { AlertTriangle, Ghost } from "lucide-react";

import { ModeToggle } from "./mode-toggle";
import { useSession } from "../context/SessionContext";
import { useCountdown } from "../hooks/useCountdown";

const FREE_FILTERS_PER_DAY = 5;

interface NavbarProps {
  onLogoClick?: () => void;
}

export function Navbar({ onLogoClick }: NavbarProps) {
  const { session } = useSession();
  const timeLeft = useCountdown(session?.lastFilterUsageDate);

  const isLoggedIn = Boolean(session?.isVerified && session?.nickname);
  const used = session?.dailyFilterUsage ?? 0;
  const filtersLeft = Math.max(0, FREE_FILTERS_PER_DAY - used);
  const filtersExhausted = session?.dailyFilterUsage !== undefined && filtersLeft === 0;
  const reportCount = session?.reportsAgainst || 0;

  return (
    <header className="glass sticky top-0 z-50 w-full border-b">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onLogoClick}
          className="flex items-center gap-2.5 rounded-md outline-none transition-opacity hover:opacity-80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <span className="grid size-8 place-items-center rounded-lg bg-primary/12">
            <Ghost className="size-4.5 text-primary" />
          </span>
          <span className="text-lg font-semibold tracking-tight">Ghostly</span>
          <span className="sr-only">Back to start</span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {isLoggedIn && session?.dailyFilterUsage !== undefined && (
            <span
              title={
                filtersExhausted
                  ? "You have used today's gender filters. Matching with Any is still open."
                  : "Matches left today using a specific gender filter"
              }
              className={`hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs sm:inline-flex ${
                filtersExhausted
                  ? "border-transparent bg-secondary text-muted-foreground"
                  : "text-muted-foreground"
              }`}
            >
              <span className="font-mono tabular-nums text-foreground">
                {filtersLeft}/{FREE_FILTERS_PER_DAY}
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

          <ModeToggle />
        </div>
      </div>
    </header>
  );
}
