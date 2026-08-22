import { useEffect, useState } from "react";
import { Ghost, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSession } from "../context/SessionContext";

interface HomeCardProps {
  status: "idle" | "waiting" | "matched";
  onFindMatch: () => void;
  onCancel: () => void;
  onEditProfile: () => void;
}

const PREFERENCE_LABEL: Record<string, string> = {
  any: "anyone",
  male: "men",
  female: "women",
};

export function HomeCard({ status, onFindMatch, onCancel, onEditProfile }: HomeCardProps) {
  const { session } = useSession();
  const waiting = status === "waiting";
  const preference = PREFERENCE_LABEL[session?.preference ?? "any"] ?? "anyone";

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-8 text-center elevation-mid animate-in fade-in zoom-in-98 duration-400">
      <div className="relative mx-auto grid size-40 place-items-center">
        {waiting && (
          <>
            <span className="absolute size-40 animate-ping rounded-full bg-primary/15 [animation-duration:2.4s]" />
            <span className="absolute size-32 rounded-full border-2 border-primary/40 border-t-transparent motion-safe:animate-spin [animation-duration:1.8s]" />
          </>
        )}
        <span className="relative grid size-24 place-items-center rounded-full border bg-background elevation-low">
          <Ghost className={`size-10 ${waiting ? "text-primary" : "text-muted-foreground"}`} />
        </span>
      </div>

      <h1 className="mt-6 text-2xl font-semibold">
        {waiting ? "Looking for someone" : `Hey, ${session?.nickname || "there"}`}
      </h1>
      <p className="mx-auto mt-2 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
        {waiting
          ? "You are in the queue. This stays open until someone matching your filter appears."
          : `You are set to meet ${preference}. Nothing you say here is stored after the chat ends.`}
      </p>

      <div className="mt-7 space-y-3">
        {waiting ? (
          <>
            <WaitingElapsed />
            <Button variant="outline" onClick={onCancel} className="h-11 w-full gap-2">
              <X className="size-4" />
              Cancel search
            </Button>
          </>
        ) : (
          <>
            <Button onClick={onFindMatch} className="h-12 w-full text-base">
              Find a match
            </Button>
            <Button
              variant="ghost"
              onClick={onEditProfile}
              className="h-9 w-full gap-2 text-muted-foreground"
            >
              <SlidersHorizontal className="size-4" />
              Edit persona and filter
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/*
 * Mounted only while the search is running, so the count starts at zero on
 * every new search without an effect resetting it.
 */
function WaitingElapsed() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const id = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, []);

  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;

  return (
    <p aria-live="polite" className="font-mono text-sm tabular-nums text-muted-foreground">
      {minutes}:{remainder.toString().padStart(2, "0")} waiting
    </p>
  );
}
