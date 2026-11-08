import { ArrowRight, Ghost, KeyRound, ScanFace, ShieldCheck, Timer, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <Footer onStart={onStart} />
    </div>
  );
}

/* Asymmetric split: message on the left, the actual product on the right. */
function Hero({ onStart }: { onStart: () => void }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-20 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-20 lg:pb-28">
      <div>
        <h1 className="text-2xl font-semibold delay-75 duration-600 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards sm:text-3xl lg:text-4xl">
          <span className="block">Talk to someone new.</span>
          <span className="block">Stay a stranger.</span>
        </h1>

        <p className="mt-5 max-w-[46ch] text-base text-muted-foreground delay-150 duration-600 animate-in fade-in slide-in-from-bottom-3 fill-mode-backwards sm:text-md">
          Pick a nickname, complete the camera check, and meet someone new.
          Messages are encrypted in your browser, and chat history is not saved.
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
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center gap-3 border-b px-4 py-3">
            <div className="grid size-9 place-items-center rounded-full bg-primary/12 text-primary">
              <Ghost className="size-4.5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium">Stranger</p>
              <p className="flex items-center gap-1.5 text-xs text-success">
                <ShieldCheck className="size-3" />
                Encrypted in transit
              </p>
            </div>
          </div>

          <div className="space-y-2 px-4 py-5">
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
    body: "A nickname and optional one-line bio are what your match sees.",
  },
  {
    title: "Hold still for the camera",
    body: "A model estimates a gender on your device. The image is discarded; the verification result is sent to the server.",
  },
  {
    title: "Get matched, start talking",
    body: "Choose who you want to meet and join the queue. Skip to the next person whenever.",
  },
];

/* Offset two-column: heading anchored left, the sequence as a real ordered list. */
function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t bg-secondary/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16 lg:py-24">
        <h2 className="reveal max-w-[16ch] text-xl font-semibold sm:text-2xl lg:self-center">
          Before you say hello.
        </h2>

        <ol className="relative before:absolute before:left-[15px] before:top-3 before:bottom-3 before:w-px before:bg-border before:content-['']">
          {STEPS.map((step, i) => (
            <li key={step.title} className="reveal relative flex gap-5 pb-11 last:pb-0">
              <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-background font-mono text-sm text-primary">
                {i + 1}
              </span>
              <div className="pt-0.5">
                <h3 className="text-md font-medium">{step.title}</h3>
                <p className="mt-2 max-w-[52ch] text-sm text-muted-foreground">
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

function Privacy() {
  return (
    <section id="privacy" className="mx-auto max-w-6xl scroll-mt-32 px-4 py-20 sm:px-6 lg:py-28">
      <h2 className="reveal max-w-[20ch] text-xl font-semibold sm:text-2xl">
        What stays private. What stays with us.
      </h2>

      <div className="mt-10 divide-y border-y">
        <article className="reveal grid gap-3 py-7 md:grid-cols-[1fr_1.5fr] md:gap-12">
          <h3 className="flex items-start gap-3 text-md font-medium"><KeyRound className="w-5 icon-lh text-primary" />Messages are encrypted in your browser</h3>
          <p className="max-w-[65ch] text-base text-muted-foreground">
            The server relays encrypted messages and does not save chat history. It also
            handles the key exchange: this protects messages from network eavesdroppers,
            but you still have to trust Ghostly’s server.
          </p>
        </article>

        <article className="reveal grid gap-3 py-7 md:grid-cols-[1fr_1.5fr] md:gap-12">
          <h3 className="flex items-start gap-3 text-md font-medium"><ScanFace className="w-5 icon-lh text-primary" />Camera images stay on your device</h3>
          <p className="max-w-[65ch] text-base text-muted-foreground">
            The camera model reads the frame on your device and discards it. The verification
            result is sent to the server; the image is never uploaded.
          </p>
        </article>

        <article className="reveal grid gap-3 py-7 md:grid-cols-[1fr_1.5fr] md:gap-12">
          <h3 className="flex items-start gap-3 text-md font-medium"><Timer className="w-5 icon-lh text-primary" />Session information is retained</h3>
          <p className="max-w-[65ch] text-base text-muted-foreground">
            Your nickname, bio, verification result, preferences, and recent match history
            stay with your session. Verified sessions expire after 30 days of inactivity.
            Reports and notes are retained separately for moderation.
          </p>
        </article>

        <article className="reveal grid gap-3 py-7 md:grid-cols-[1fr_1.5fr] md:gap-12">
          <h3 className="flex items-start gap-3 text-md font-medium"><UserRoundX className="w-5 icon-lh text-primary" />Recent partners are kept apart</h3>
          <p className="max-w-[65ch] text-base text-muted-foreground">
            Matching remembers recent partners. Repeats can happen after enough conversations
            or a new session. Use Report in a chat to send a reason and optional note to
            moderation; the conversation itself is not attached.
          </p>
        </article>
      </div>
    </section>
  );
}

function Footer({ onStart }: { onStart: () => void }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
        <span className="flex items-center gap-2">
          <Ghost className="size-4" />
          Ghostly
        </span>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a href="#privacy" className="inline-flex min-h-11 items-center rounded-md underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Privacy and safety</a>
          <Button variant="link" onClick={onStart}>Start a conversation <ArrowRight className="size-4" /></Button>
        </div>
      </div>
    </footer>
  );
}
