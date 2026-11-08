import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Ghost, RotateCw } from "lucide-react";

import { preloadFaceFraming } from "./hooks/useFaceFraming";
import { loadGenderClassifier } from "./lib/genderClassifier";
import { useSession } from "./context/SessionContext";
import { useMatch } from "./context/MatchContext";
import { useSocket } from "./context/SocketContext";
import { LandingPage } from "./components/LandingPage";
import { Navbar } from "./components/Navbar";
import { HomeCard } from "./components/HomeCard";
import { OnboardingSteps } from "./components/OnboardingSteps";
import { CardSkeleton } from "./components/CardSkeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const Verify = lazy(() => import("./components/Verify").then((m) => ({ default: m.Verify })));
const Chat = lazy(() => import("./components/Chat"));
const ProfileSetup = lazy(() =>
  import("./components/ProfileSetup").then((m) => ({ default: m.ProfileSetup }))
);

function App() {
  const { loading, session, isColdStart, refreshSession } = useSession();
  const { findMatch, status, roomId, partner, cancelMatch } = useMatch();
  const { connectionState } = useSocket();
  const [verified, setVerified] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const focusMain = useCallback((node: HTMLElement | null) => { node?.focus(); }, []);

  // Warmed at the profile step, never on the landing page.
  //
  // The models are ~11.7MB. Preloading them for every visitor meant paying that
  // for people who bounced before verification ever came up -- bandwidth that
  // is metered on the free tier and comes out of the same monthly allowance
  // that serves the app itself.
  //
  // The funnel is Landing -> ProfileSetup -> Verify, so leaving the landing
  // page is the start of the profile step: that still buys a whole step of
  // warm-up while only paying for users who are actually heading there. Both
  // are idempotent and swallow their own errors, so a failure of either leaves
  // the flow working. Derived here rather than from needsProfile, which is
  // computed below the early returns and so is not available to a hook.
  const headingToVerification = !showLanding && Boolean(session) && !session?.isVerified;

  useEffect(() => {
    if (headingToVerification) {
      void preloadFaceFraming();
      void loadGenderClassifier().catch(() => {});
    }
  }, [headingToVerification]);

  const handleVerified = async () => {
    await refreshSession();
    setVerified(true);
  };

  const handleProfileComplete = async () => {
    await refreshSession();
    setProfileComplete(true);
    setEditingProfile(false);
  };

  const goHome = () => {
    cancelMatch();
    setShowLanding(true);
  };

  if (showLanding) {
    return (
      <div className="flex min-h-[100dvh] flex-col overflow-x-clip bg-background text-foreground">
        <Navbar onLogoClick={goHome} />
        <main className="flex-1">
          <LandingPage onStart={() => setShowLanding(false)} />
        </main>
      </div>
    );
  }

  if (loading || retrying) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
        <Navbar onLogoClick={goHome} />
        <main ref={focusMain} tabIndex={-1} aria-label="Starting your session" className="mx-auto w-full max-w-md flex-1 px-4 py-10 outline-none">
          <CardSkeleton />
          {/*
            The API sleeps after 15 minutes idle and takes about a minute to
            wake. Without this the first visitor after a nap watches an
            unexplained skeleton and concludes the app is broken -- so say what
            is happening rather than letting them guess.
          */}
          {isColdStart && (
            <p
              role="status"
              aria-live="polite"
              className="mt-6 text-center text-sm text-muted-foreground animate-in fade-in duration-500"
            >
              Waking the server up — it sleeps when nobody is around.
              <span className="mt-1 block text-xs">This takes up to a minute.</span>
            </p>
          )}
        </main>
      </div>
    );
  }

  if (!session) {
    return (
      <main ref={focusMain} tabIndex={-1} aria-label="Session unavailable" className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background p-6 text-center text-foreground outline-none">
        <div className="grid size-16 place-items-center rounded-full bg-destructive/10">
          <Ghost className="size-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-semibold">We could not start a session</h1>
          <p className="max-w-md text-muted-foreground">
            The server did not answer, or you have made too many requests in a short window.
            Waiting a moment and retrying usually fixes it.
          </p>
        </div>
        <Button onClick={async () => { setRetrying(true); try { await refreshSession(); } finally { setRetrying(false); } }} size="lg" className="gap-2">
          <RotateCw className="size-4" />
          Try again
        </Button>
        <Button variant="ghost" onClick={goHome}>Back to start</Button>
      </main>
    );
  }

  const needsProfile =
    editingProfile || (!profileComplete && (!session.nickname || session.nickname === "Anonymous"));
  const needsVerify = !needsProfile && !verified && !session.isVerified;
  const inChat = status === "matched" && !!roomId;

  const screenName = needsProfile ? "Set up your persona" : needsVerify ? "Camera verification" : inChat ? "Conversation" : status === "waiting" ? "Finding a match" : "Find a match";

  return (
    <div className={`flex flex-col overflow-x-clip bg-background text-foreground ${inChat ? "h-dvh min-h-[40rem]" : "min-h-[100dvh]"}`}>
      <Navbar onLogoClick={goHome} />

      <main
        key={screenName}
        ref={focusMain}
        tabIndex={-1}
        aria-label={screenName}
        className={`mx-auto flex w-full min-h-0 flex-1 flex-col justify-center px-4 outline-none ${
          inChat ? "max-w-2xl py-2 sm:py-4" : "max-w-md py-6 sm:py-10"
        }`}
      >
        {session.isVerified && connectionState !== "connected" && (
          <Alert className="mb-4 shrink-0" role={connectionState === "failed" ? "alert" : "status"}>
            <AlertTitle>{connectionState === "failed" ? "Connection lost" : "Connecting to chat"}</AlertTitle>
            <AlertDescription>
              {connectionState === "failed" ? "Reload to reconnect. This ends any current conversation and clears its messages." : "Please wait while the chat connection opens."}
              {connectionState === "failed" && <Button variant="outline" onClick={() => window.location.reload()}>Reload to reconnect</Button>}
            </AlertDescription>
          </Alert>
        )}
        {needsProfile ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
            {!editingProfile && <OnboardingSteps current={0} />}
            <Suspense fallback={<CardSkeleton />}>
              <ProfileSetup
                onComplete={handleProfileComplete}
                onCancel={editingProfile ? () => setEditingProfile(false) : undefined}
              />
            </Suspense>
          </div>
        ) : needsVerify ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
            <OnboardingSteps current={1} />
            <Suspense fallback={<CardSkeleton />}>
              <Verify onVerified={handleVerified} />
            </Suspense>
          </div>
        ) : inChat ? (
          <div className="flex min-h-0 flex-1 flex-col animate-in fade-in zoom-in-98 duration-300">
            <Suspense fallback={<CardSkeleton />}>
              <Chat roomId={roomId!} partner={partner} />
            </Suspense>
          </div>
        ) : (
          <HomeCard
            status={status}
            onFindMatch={findMatch}
            onCancel={cancelMatch}
            onEditProfile={() => setEditingProfile(true)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
