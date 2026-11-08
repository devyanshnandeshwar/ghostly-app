import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Flag, Ghost, LockKeyhole, LogOut, Send, ShieldCheck } from "lucide-react";

import { useChat } from "../hooks/useChatHook";
import { useMatch } from "../context/MatchContext";
import { useSession } from "../context/SessionContext";
import ReportModal from "./ReportModal";
import { ChatBubble } from "./ChatBubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ChatProps {
  roomId: string;
  partner: { nickname: string; bio: string } | null;
}

export default function Chat({ roomId, partner }: ChatProps) {
  const { messages, input, setInput, sendMessage, reportUser, isPartnerTyping, isEncrypted, encryptionError, sendError } =
    useChat(roomId);
  const { leaveMatch, nextMatch } = useMatch();
  const { session } = useSession();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const previousScrollTop = useRef(0);
  const [following, setFollowing] = useState(true);
  const scrollToLatest = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
  }, []);

  // Incoming activity must not displace someone reading older messages.
  useEffect(() => {
    if (followingRef.current) scrollToLatest();
  }, [messages, isPartnerTyping, scrollToLatest]);

  const handleReportSubmit = async (reason: string, description: string) => {
    await reportUser(reason, description);
    setIsReportModalOpen(false);
  };

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-x-hidden overflow-y-auto rounded-xl border bg-card">
      {/* Header */}
      <header className="z-20 grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b bg-card px-3 py-3 sm:flex sm:px-4">
        <div className="relative shrink-0">
          <span className="grid size-10 place-items-center rounded-full bg-primary/12 text-primary">
            <Ghost className="size-5" />
          </span>
          <span
            title={
              isEncrypted
                ? "Encrypted in this browser. Keys are relayed by the server, so this protects against network eavesdroppers rather than against Ghostly itself."
                : "Exchanging keys"
            }
            className={`absolute -bottom-0.5 -right-0.5 grid size-4 place-items-center rounded-full border-2 border-card ${
              isEncrypted ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {isEncrypted ? <ShieldCheck className="size-2.5" /> : <LockKeyhole className="size-2.5" />}
            <span className="sr-only">
              {isEncrypted ? "Encrypted in transit" : "Exchanging encryption keys"}
            </span>
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="wrap-break-word text-sm font-semibold">
            {partner?.nickname || "Stranger"}
          </h1>
          {partner?.bio ? (
            <p className="wrap-break-word text-xs text-muted-foreground">{partner.bio}</p>
          ) : (
            <p
              className={`flex items-center gap-1 text-xs ${
                isEncrypted ? "text-success" : "text-muted-foreground"
              }`}
            >
              {isEncrypted ? (
                <>
                  <ShieldCheck className="size-3" />
                  Encrypted in transit
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

        <div className="col-span-2 flex shrink-0 flex-wrap items-center justify-end gap-1.5 sm:ml-auto">
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
            aria-label="Leave the chat and go back"
          >
            <LogOut className="size-4" />
            <span>Leave</span>
          </Button>

          <Button variant="secondary" size="sm" onClick={nextMatch} className="gap-1.5" title="Skip to the next person" aria-label="Skip to the next person">
            <span>Next</span>
            <ArrowRight className="size-4" />
          </Button>
        </div>
      </header>

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="min-h-0 flex-1" onScrollCapture={(event) => {
        const viewport = event.target;
        if (!(viewport instanceof HTMLElement)) return;
        const nearBottom = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 48;
        // Programmatic downward scrolling must not disable following mid-animation.
        if (nearBottom || viewport.scrollTop < previousScrollTop.current) {
          followingRef.current = nearBottom;
          setFollowing(nearBottom);
        }
        previousScrollTop.current = viewport.scrollTop;
      }}>
        <div
          role="log"
          aria-label="Conversation messages"
          aria-live="polite"
          aria-relevant="additions"
          className={`flex flex-1 flex-col gap-2 p-4 ${
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

              // A message that arrived but would not decrypt. Shown as a gap
              // rather than as text: rendering it in an ordinary bubble, which
              // is what happened while decryptMessage returned its own error
              // string, puts words in the other person's mouth.
              if (msg.failed) {
                return (
                  <p
                    key={i}
                    className="my-2 text-center text-xs italic text-muted-foreground"
                  >
                    A message could not be decrypted.
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
                  senderName={partner?.nickname || "Stranger"}
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

        </div>
      </ScrollArea>

      {!following && <Button variant="secondary" className="m-2 self-center" onClick={() => {
        followingRef.current = true;
        setFollowing(true);
        scrollToLatest();
      }}>Jump to latest messages</Button>}

      {encryptionError && <Alert variant="destructive" className="shrink-0 rounded-none border-x-0"><AlertDescription>
        {encryptionError}
        <Button variant="outline" onClick={nextMatch}>Find another match</Button>
      </AlertDescription></Alert>}
      {sendError && <p role="alert" className="shrink-0 px-3 py-2 text-sm text-destructive">{sendError}</p>}

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isEncrypted && input.trim()) {
            followingRef.current = true;
            setFollowing(true);
            void sendMessage();
          }
        }}
        className="z-20 flex shrink-0 items-center gap-2 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isEncrypted ? "Message" : "Setting up encryption"}
          className="h-11 flex-1"
          aria-label="Message"
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
        reasons={session?.reportReasons ?? ["Other"]}
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
        <p className="mt-1 max-w-[38ch] text-sm text-muted-foreground">
          {isEncrypted
            ? "Say something. Neither of you knows who the other is, and none of this is kept."
            : "Keys are being exchanged. You can send messages once encryption is ready."}
        </p>
      </div>
    </div>
  );
}
