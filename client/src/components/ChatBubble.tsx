import { cn } from "@/lib/utils";

interface ChatBubbleProps {
  text: string;
  from: "me" | "them";
  /** First bubble of a run gets the full corner; the rest tuck in under it. */
  startsRun?: boolean;
  className?: string;
  senderName?: string;
}

/*
 * The single source of truth for how a message looks. Chat renders these for
 * real traffic and the landing page renders them for its preview, so the
 * preview cannot drift away from the product.
 */
export function ChatBubble({ text, from, startsRun = true, className, senderName = "Stranger" }: ChatBubbleProps) {
  const mine = from === "me";

  return (
    <div className={cn("flex w-full", mine ? "justify-end" : "justify-start", className)}>
      <div
        className={cn(
          "max-w-[80%] px-3.5 py-2.5 text-sm wrap-break-word elevation-low",
          mine
            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
            : "bg-secondary text-secondary-foreground rounded-2xl rounded-bl-sm",
          !startsRun && (mine ? "rounded-tr-sm" : "rounded-tl-sm")
        )}
      >
        <span className="sr-only">{mine ? "You" : senderName}: </span>
        {text}
      </div>
    </div>
  );
}
