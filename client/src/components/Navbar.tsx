import { Ghost, AlertTriangle, Clock } from "lucide-react";
import { ModeToggle } from "./mode-toggle";
import { Badge } from "@/components/ui/badge";
import { useSession } from "../context/SessionContext";
import { useCountdown } from "../hooks/useCountdown";

interface NavbarProps {
    onLogoClick?: () => void;
}

export function Navbar({ onLogoClick }: NavbarProps) {
  const { session } = useSession();
//   const [reportCount, setReportCount] = useState<number>(0);
  const timeLeft = useCountdown(session?.lastFilterUsageDate);
  const isLoggedIn = session && session.isVerified && session.nickname;
  const reportCount = session?.reportsAgainst || 0;

  // Initial fetch is handled by SessionContext.
  // We rely on refreshSession() being called elsewhere.

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-14 max-w-screen-2xl items-center mx-auto px-4">
        <div 
            className="flex items-center gap-2 font-bold text-xl cursor-pointer hover:opacity-80 transition-opacity"
            onClick={onLogoClick}
        >
          <div className="bg-primary/10 p-2 rounded-lg">
             <Ghost className="h-5 w-5 text-primary" />
          </div>
          <span className="hidden sm:inline-block text-primary">
            Ghostly
          </span>
        </div>
        <div className="flex flex-1 items-center justify-end space-x-2">
            <nav className="flex items-center gap-4">
               {isLoggedIn && (
                   <>
                        {/* Free Matches Count */}
                        {session?.dailyFilterUsage !== undefined && (
                             <Badge variant={session.dailyFilterUsage >= 5 ? "destructive" : "outline"} className="gap-1">
                                <span className="hidden sm:inline">Free Matches:</span>
                                {Math.max(0, 5 - (session.dailyFilterUsage || 0))}/5
                            </Badge>
                        )}

                        {/* Free Tier Restore Timer */}
                        {session?.dailyFilterUsage !== undefined && session.dailyFilterUsage >= 5 && timeLeft && (
                            <Badge variant="outline" className="gap-1 font-mono text-xs">
                                <Clock className="h-3 w-3" />
                                {timeLeft}
                            </Badge>
                        )}

                        {/* Report Badge */}
                        <Badge variant={reportCount > 0 ? (reportCount > 2 ? "destructive" : "secondary") : "outline"} className="gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            <span className="hidden sm:inline">Reports:</span> {reportCount}
                        </Badge>
                   </>
               )}
               <ModeToggle />
            </nav>
        </div>
      </div>
    </header>
  );
}
