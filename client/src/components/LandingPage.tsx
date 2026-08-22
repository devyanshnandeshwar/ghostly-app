import { ArrowRight, Ghost, KeyRound, ScanFace, ShieldCheck, Timer, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatBubble } from "./ChatBubble";

interface LandingPageProps {
  onStart: () => void;
}

export function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="w-full">
      <Hero onStart={onStart} />
      <HowItWorks />
      <Privacy />
      <ClosingCta onStart={onStart} />
      <Footer />
    </div>
  );
}

/* Asymmetric split: message on the left, the actual product on the right. */
function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-20 lg:pb-28">
      <div>
        <Badge
          variant="outline"
          className="mb-6 gap-1.5 border-primary/25 bg-primary/10 px-3 py-1 text-primary animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards duration-500"
        >
          <Ghost className="size-3.5" />
          No account, no trace
        </Badge>

        {/* Two lines at every breakpoint: the type scale is sized to the column. */}
        <h1 className="text-[2rem] font-semibold leading-[1.08] delay-75 duration-600 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards sm:text-5xl lg:text-[3.4rem]">
          <span className="block">Talk to someone new.</span>
          <span className="block text-muted-foreground">Stay a stranger.</span>
        </h1>

        <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-muted-foreground delay-150 duration-600 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards sm:text-lg">
          Every person here passed a camera check, and every message is encrypted in your
          browser before it leaves.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3 delay-225 duration-600 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards">
          <Button size="lg" onClick={onStart} className="h-12 gap-2 px-7 text-base">
            Start messaging
            <ArrowRight className="size-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Takes about a minute</span>
        </div>
      </div>

      <ChatPreview />
    </section>
  );
}

/*
 * A real, static instance of the chat surface rather than a mocked-up
 * screenshot. Aria-hidden because it is illustrative, not readable content.
 */
function ChatPreview() {
  return (
    <div
      aria-hidden="true"
      className="delay-300 duration-700 animate-in fade-in slide-in-from-bottom-6 fill-mode-backwards"
    >
      <div className="relative mx-auto w-full max-w-md">
        {/* Accent wash behind the panel, tinted to the one brand colour. */}
        <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(60%_60%_at_70%_10%,color-mix(in_oklab,var(--primary)_22%,transparent),transparent_70%)] blur-2xl" />

        <div className="overflow-hidden rounded-2xl border bg-card elevation-high">
          <div className="glass flex items-center gap-3 border-b px-4 py-3">
            <div className="grid size-9 place-items-center rounded-full bg-primary/12 text-primary">
              <Ghost className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight">Stranger</p>
              <p className="flex items-center gap-1.5 text-xs leading-tight text-success">
                <ShieldCheck className="size-3" />
                End-to-end encrypted
              </p>
            </div>
          </div>

          <div className="space-y-1.5 px-4 py-5">
            <ChatBubble from="them" text="ok be honest, what time did you actually go to sleep" />
            <ChatBubble from="me" text="4:10am" />
            <ChatBubble from="me" startsRun={false} text="i was reading about deep sea fish, no regrets" />
            <ChatBubble from="them" text="genuinely the best reason i've heard all week" />
            <div className="flex justify-start pt-1">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-3">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Pick a name that isn't yours",
    body: "A nickname and an optional one-line bio. That is the entire profile.",
  },
  {
    title: "Hold still for the camera",
    body: "A model checks the frame, returns a gender, and the image is discarded. Nothing is stored.",
  },
  {
    title: "Get matched, start talking",
    body: "Choose who you want to meet and join the queue. Skip to the next person whenever.",
  },
];

/* Offset two-column: heading anchored left, the sequence as a real ordered list. */
function HowItWorks() {
  return (
    <section className="border-t bg-secondary/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:py-24">
        <h2 className="reveal max-w-[16ch] text-3xl font-semibold sm:text-4xl lg:self-center">
          Three things stand between you and a conversation.
        </h2>

        <ol className="relative">
          <span
            aria-hidden="true"
            className="absolute left-[15px] top-3 bottom-3 w-px bg-border"
          />
          {STEPS.map((step, i) => (
            <li key={step.title} className="reveal relative flex gap-5 pb-11 last:pb-0">
              <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-background font-mono text-sm text-primary">
                {i + 1}
              </span>
              <div className="pt-0.5">
                <h3 className="text-lg font-medium">{step.title}</h3>
                <p className="mt-1.5 max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* Four claims, four cells, deliberately unequal. */
function Privacy() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <h2 className="reveal max-w-[20ch] text-3xl font-semibold sm:text-4xl">
        What we keep is nothing.
      </h2>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <article className="reveal relative overflow-hidden rounded-xl border bg-card p-6 elevation-low sm:col-span-2 lg:col-span-3 lg:p-8">
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-0 bg-[radial-gradient(90%_70%_at_100%_0%,color-mix(in_oklab,var(--primary)_16%,transparent),transparent_65%)]"
          />
          <div className="relative">
            <KeyRound className="size-6 text-primary" />
            <h3 className="mt-5 text-xl font-medium">Encrypted before it leaves your browser</h3>
            <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
              Both sides derive a shared key and the server only ever relays ciphertext. Keys
              travel through the server, so this stops anyone listening on the network rather
              than the server itself.
            </p>
            <p
              aria-hidden="true"
              className="mt-6 rounded-lg border bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
            >
              browser <span className="text-primary">encrypt</span> server <span className="text-primary">decrypt</span> browser
              <br />
              the server only ever holds the ciphertext
            </p>
          </div>
        </article>

        <article className="reveal relative overflow-hidden rounded-xl border bg-card p-6 elevation-low lg:col-span-2">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_100%,color-mix(in_oklab,var(--primary)_11%,transparent),transparent_70%)]"
          />
          <div className="relative">
            <ScanFace className="size-6 text-primary" />
            <h3 className="mt-5 text-lg font-medium">Frames are never written down</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              The verification image is processed in memory and dropped. It never touches a
              disk, and no one but the model sees it.
            </p>
          </div>
        </article>

        <article className="reveal rounded-xl border bg-card p-6 elevation-low lg:col-span-2">
          <Timer className="size-6 text-primary" />
          <h3 className="mt-5 text-lg font-medium">Sessions expire on their own</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            A session holds a nickname and a verified flag, and is deleted 30 days after you
            last use it.
          </p>
        </article>

        <article className="reveal relative overflow-hidden rounded-xl border bg-card p-6 elevation-low sm:col-span-2 lg:col-span-3">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-[linear-gradient(135deg,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_60%)]"
          />
          <div className="relative">
            <UserRoundX className="size-6 text-primary" />
            <h3 className="mt-5 text-lg font-medium">You will not be paired twice</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Once a conversation ends, that person is out of your pool for good. Report
              anyone who crosses a line.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

function ClosingCta({ onStart }: { onStart: () => void }) {
  return (
    <section className="border-t bg-secondary/30">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:px-6 lg:py-24">
        <h2 className="reveal max-w-[18ch] text-3xl font-semibold sm:text-4xl">
          Someone is waiting on the other side.
        </h2>
        <Button size="lg" onClick={onStart} className="h-12 gap-2 px-7 text-base">
          Start messaging
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <span className="flex items-center gap-2">
          <Ghost className="size-4" />
          Ghostly
        </span>
        <span>Be decent to strangers.</span>
      </div>
    </footer>
  );
}
