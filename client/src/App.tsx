import { lazy, Suspense, useState } from "react";
import { Ghost, RotateCw } from "lucide-react";

import { useSession } from "./context/SessionContext";
import { useMatch } from "./context/MatchContext";
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
  const { loading, session, refreshSession } = useSession();
  const { findMatch, status, roomId, partner, cancelMatch } = useMatch();
  const [verified, setVerified] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [showLanding, setShowLanding] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);

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

  const needsProfile =
    editingProfile || (!profileComplete && (!session.nickname || session.nickname === "Anonymous"));
  const needsVerify = !needsProfile && !verified && !session.isVerified;
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
