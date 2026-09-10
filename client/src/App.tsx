import { lazy, Suspense, useEffect, useState } from "react";
import { Ghost, RotateCw } from "lucide-react";

import { preloadFaceFraming } from "./hooks/useFaceFraming";
import { loadGenderClassifier } from "./lib/genderClassifier";
import { useSession } from "./context/SessionContext";
import { useMatch } from "./context/MatchContext";
import { AgeGate } from "./components/AgeGate";
import { LandingPage } from "./components/LandingPage";
import { Navbar } from "./components/Navbar";
import { HomeCard } from "./components/HomeCard";
import { OnboardingSteps } from "./components/OnboardingSteps";
import { CardSkeleton } from "./components/CardSkeleton";
import { Button } from "@/components/ui/button";

const Verify = lazy(() => import("./components/Verify").then((m) => ({ default: m.Verify })));
const Chat = lazy(() => import("./components/Chat"));
const ProfileSetup = lazy(() =>
  import("./components/ProfileSetup").then((m) => ({ default: m.ProfileSetup }))
);

function App() {
  const { loading, session, isColdStart, refreshSession } = useSession();
  const { findMatch, status, roomId, partner, cancelMatch } = useMatch();
  const [verified, setVerified] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);

  // Warmed at the profile step rather than on leaving the landing page.
  //
  // The models are ~11.7MB. Preloading them for everyone who clicked "start"
  // meant paying that for visitors who bounced before verification ever came
  // up -- bandwidth that is metered on the free tier and comes out of the same
  // monthly allowance that serves the app itself.
  //
  // The funnel is Landing -> AgeGate -> ProfileSetup -> Verify, so starting at
  // the profile step still buys a whole step of warm-up while only paying for
  // users who are actually heading there. Both are idempotent and swallow
  // their own errors, so a failure of either leaves the flow working.
  // Derived here rather than from needsProfile, which is computed below the
  // early returns and so is not available to a hook.
  const headingToVerification =
    (ageConfirmed || Boolean(session?.ageConfirmed)) && !session?.isVerified;

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

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
        <Navbar />
        <div className="mx-auto w-full max-w-md flex-1 px-4 py-10">
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
              className="mt-6 text-center text-sm leading-relaxed text-muted-foreground animate-in fade-in duration-500"
            >
              Waking the server up — it sleeps when nobody is around.
              <span className="mt-1 block text-xs">This takes up to a minute.</span>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-background p-6 text-center text-foreground">
        <div className="grid size-16 place-items-center rounded-full bg-destructive/10">
          <Ghost className="size-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">We could not start a session</h1>
          <p className="max-w-md text-muted-foreground">
            The server did not answer, or you have made too many requests in a short window.
            Waiting a moment and retrying usually fixes it.
          </p>
        </div>
        <Button onClick={() => window.location.reload()} size="lg" className="gap-2">
          <RotateCw className="size-4" />
          Try again
        </Button>
      </div>
    );
  }

  // Ordered so the age declaration comes before anything else asks for a
  // camera or a persona.
  const needsAge = !ageConfirmed && !session.ageConfirmed;
  const needsProfile =
    editingProfile || (!profileComplete && (!session.nickname || session.nickname === "Anonymous"));
  const needsVerify = !needsAge && !needsProfile && !verified && !session.isVerified;
  const inChat = status === "matched" && !!roomId;

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

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-clip bg-background text-foreground">
      <Navbar onLogoClick={goHome} />

      <main
        className={`mx-auto flex w-full flex-1 flex-col justify-center px-4 py-6 sm:py-10 ${
          inChat ? "max-w-2xl" : "max-w-md"
        }`}
      >
        {needsAge ? (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
            <AgeGate
              onConfirmed={async () => {
                await refreshSession();
                setAgeConfirmed(true);
              }}
            />
          </div>
        ) : needsProfile ? (
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
          <div className="animate-in fade-in zoom-in-98 duration-300">
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
