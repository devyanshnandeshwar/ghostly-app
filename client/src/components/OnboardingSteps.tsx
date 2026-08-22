import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Persona", "Verify", "Match"] as const;

/*
 * Tells the user how far into setup they are, so the camera prompt on step two
 * does not arrive without warning.
 */
export function OnboardingSteps({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol
      aria-label={`Setup step ${current + 1} of ${STEPS.length}`}
      className="mx-auto mb-6 flex w-full max-w-md items-center gap-2"
    >
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;

        return (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-border">
                <span
                  className={cn(
                    "block h-full origin-left rounded-full bg-primary transition-transform duration-500 ease-out",
                    done || active ? "scale-x-100" : "scale-x-0"
                  )}
                />
              </span>
              <span
                className={cn(
                  "flex items-center gap-1 truncate text-xs",
                  active ? "font-medium text-foreground" : "text-muted-foreground"
                )}
              >
                {done && <Check className="size-3 shrink-0 text-primary" />}
                {label}
                {active && <span className="sr-only"> (current step)</span>}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
