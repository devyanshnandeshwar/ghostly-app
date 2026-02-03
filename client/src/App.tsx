
import { useSession } from "./context/SessionContext";
import { useMatch } from "./context/MatchContext";
import { Verify } from "./components/Verify";
import Chat from "./components/Chat";
import { ProfileSetup } from "./components/ProfileSetup";
import { LandingPage } from "./components/LandingPage";
import { useState } from "react";
import { Ghost, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "./components/Navbar";
import { HomeCard } from "./components/HomeCard";

function App() {


  const { loading, session, refreshSession } = useSession();
  const { findMatch, status, roomId, partner, cancelMatch } = useMatch();
  const [verified, setVerified] = useState(false);
  const [profileComplete, setProfileComplete] = useState(false);
  const [showLanding, setShowLanding] = useState(true);

  const handleVerified = async () => {
    await refreshSession();
    setVerified(true);
  };

  const handleProfileComplete = async () => {
    await refreshSession();
    setProfileComplete(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center space-y-6">
        <div className="p-6 bg-destructive/10 rounded-full">
          <Ghost size={48} className="text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Connection Failed</h1>
          <p className="text-muted-foreground max-w-md">
            We couldn't initialize your session. This might be due to network issues or rate limiting.
          </p>
        </div>
        <Button
          onClick={() => window.location.reload()}
          size="lg"
        >
          Try Again
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-x-hidden bg-background text-foreground">
      <Navbar onLogoClick={() => {
          cancelMatch();
          setShowLanding(true);
      }} />

      <div className="z-10 w-full max-w-5xl mx-auto py-2 px-2 sm:py-4 sm:px-4 flex justify-center flex-1 items-center">
          {showLanding ? (
              <LandingPage onStart={() => setShowLanding(false)} />
          ) : (!profileComplete && (!session?.nickname || session.nickname === "Anonymous")) ? (
              <div className="w-full animate-in fade-in slide-in-from-right-8 duration-500">
                <ProfileSetup onComplete={handleProfileComplete} />
              </div>
          ) : (!verified && !session?.isVerified) ? (
              <div className="w-full animate-in fade-in slide-in-from-right-8 duration-500">
                <Verify onVerified={handleVerified} />
              </div>
          ) : (status === "matched" && roomId) ? (
              <div className="w-full animate-in zoom-in-95 fade-in duration-300">
                <Chat
                    roomId={roomId}
                    partner={partner}
                />
              </div>
          ) : (
            <HomeCard status={status} onFindMatch={findMatch} />
          )}
      </div>
    </div>
  );
}

export default App;
