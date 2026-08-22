import { useEffect, useRef, useState } from "react";
import { ArrowRight, Flag, Ghost, LockKeyhole, LogOut, Send, ShieldCheck } from "lucide-react";

import { useChat } from "../hooks/useChatHook";
import { useMatch } from "../context/MatchContext";
import ReportModal from "./ReportModal";
import { ChatBubble } from "./ChatBubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatProps {
  roomId: string;
  partner: { nickname: string; bio: string } | null;
}

export default function Chat({ roomId, partner }: ChatProps) {
  const { messages, input, setInput, sendMessage, reportUser, isPartnerTyping, isEncrypted } =
    useChat(roomId);
  const { leaveMatch, nextMatch } = useMatch();
  const [reported, setReported] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isPartnerTyping]);

  const handleReportSubmit = (reason: string, description: string) => {
    reportUser(reason, description);
    setIsReportModalOpen(false);
    setReported(true);
    setTimeout(() => setReported(false), 2600);
  };

  return (
    <div className="relative mx-auto flex h-[calc(100dvh-7rem)] min-h-100 w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card elevation-high sm:h-[calc(100dvh-9rem)]">
      {reported && (
        <div
          role="status"
          className="glass-panel absolute left-1/2 top-4 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-300"
        >
          Report sent. Moderation will review it.
        </div>
      )}

      {/* Header */}
      <header className="glass z-20 flex items-center gap-3 border-b px-3 py-3 sm:px-4">
        <div className="relative shrink-0">
          <span className="grid size-10 place-items-center rounded-full bg-primary/12 text-primary">
            <Ghost className="size-5" />
          </span>
          <span
            title={isEncrypted ? "End-to-end encrypted" : "Exchanging keys"}
            className={`absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full border-2 border-card ${
              isEncrypted ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {isEncrypted ? <ShieldCheck className="size-2.5" /> : <LockKeyhole className="size-2.5" />}
            <span className="sr-only">
              {isEncrypted ? "End-to-end encrypted" : "Exchanging encryption keys"}
            </span>
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight">
            {partner?.nickname || "Stranger"}
          </h2>
          {partner?.bio ? (
            <p className="truncate text-xs leading-tight text-muted-foreground">{partner.bio}</p>
          ) : (
            <p
              className={`flex items-center gap-1 text-xs leading-tight ${
                isEncrypted ? "text-success" : "text-muted-foreground"
              }`}
            >
              {isEncrypted ? (
                <>
                  <ShieldCheck className="size-3" />
                  End-to-end encrypted
                </>
              ) : (
                <>
                  <LockKeyhole className="size-3" />
                  Exchanging keys
                </>
              )}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setIsReportModalOpen(true)}
            className="text-muted-foreground hover:text-destructive"
            aria-label="Report this user"
            title="Report this user"
          >
            <Flag className="size-4" />
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={leaveMatch}
            className="gap-1.5 text-muted-foreground"
            title="Leave the chat and go back"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Leave</span>
          </Button>

          <Button variant="secondary" size="sm" onClick={nextMatch} className="gap-1.5" title="Skip to the next person">
            <span className="hidden sm:inline">Next</span>
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div
          aria-live="polite"
          aria-relevant="additions"
          className={`flex flex-1 flex-col gap-1.5 p-4 ${
            messages.length === 0 ? "justify-center" : "justify-end"
          }`}
        >
          {messages.length === 0 ? (
            <EmptyThread nickname={partner?.nickname} isEncrypted={isEncrypted} />
          ) : (
            messages.map((msg, i) => {
              if (msg.sender === "system") {
                return (
                  <p
                    key={i}
                    className="my-2 text-center text-xs text-muted-foreground"
                  >
                    {msg.text}
                  </p>
                );
              }

              const previous = messages[i - 1];
              const startsRun = !previous || previous.sender !== msg.sender;

              return (
                <ChatBubble
                  key={i}
                  text={msg.text}
                  from={msg.sender === "me" ? "me" : "them"}
                  startsRun={startsRun}
                  className={`animate-in fade-in slide-in-from-bottom-1 duration-300 ${
                    startsRun ? "mt-2 first:mt-0" : ""
                  }`}
                />
              );
            })
          )}

          {isPartnerTyping && (
            <div className="flex justify-start animate-in fade-in duration-300">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-3">
                <span className="sr-only">{partner?.nickname || "Stranger"} is typing</span>
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
              </div>
            </div>
          )}

          <div ref={scrollRef} className="h-px" />
        </div>
      </ScrollArea>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isEncrypted && input.trim()) sendMessage();
        }}
        className="glass z-20 flex items-center gap-2 border-t p-3"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isEncrypted ? "Message" : "Setting up encryption"}
          className="h-11 flex-1"
          aria-label="Message"
          autoFocus
          autoComplete="off"
          disabled={!isEncrypted}
        />
        <Button
          type="submit"
          size="icon-lg"
          disabled={!input.trim() || !isEncrypted}
          aria-label="Send message"
          className="size-11 shrink-0"
        >
          <Send className="size-4.5" />
        </Button>
      </form>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSubmit={handleReportSubmit}
      />
    </div>
  );
}

/* An empty thread is the most common first frame, so it gets a real state. */
function EmptyThread({ nickname, isEncrypted }: { nickname?: string; isEncrypted: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-secondary">
        {isEncrypted ? (
          <ShieldCheck className="size-5 text-success" />
        ) : (
          <LockKeyhole className="size-5 text-muted-foreground" />
        )}
      </span>
      <div>
        <p className="text-sm font-medium">
          {isEncrypted
            ? `You are connected to ${nickname || "a stranger"}`
            : "Setting up encryption"}
        </p>
        <p className="mt-1 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
          {isEncrypted
            ? "Say something. Neither of you knows who the other is, and none of this is kept."
            : "Keys are being exchanged. The composer unlocks in a second."}
        </p>
      </div>
    </div>
  );
}
