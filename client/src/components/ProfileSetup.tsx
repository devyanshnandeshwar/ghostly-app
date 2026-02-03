import { useState } from "react";
import api from "../services/client";
import { getDeviceId } from "../utils/device";
import { User, FileText, ArrowRight, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ProfileSetupProps {
    onComplete: () => void;
}

import { useSession } from "../context/SessionContext";

export function ProfileSetup({ onComplete }: ProfileSetupProps) {
    const { session } = useSession();
    const [nickname, setNickname] = useState(session?.nickname || "");
    const [bio, setBio] = useState(session?.bio || "");
    const [preference, setPreference] = useState(session?.preference || "any");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            await api.post("/profile/update", {
                nickname,
                bio,
                preference
            }, {
                headers: { "X-Device-Id": getDeviceId() }
            });
            onComplete();
        } catch (err: any) {
            console.error("Profile update failed:", err);
            setError(err.response?.data?.error || "Failed to update profile");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card className="w-full max-w-md mx-auto border-border/50 shadow-2xl">
            <CardHeader className="text-center">
                <CardTitle className="text-3xl font-bold text-foreground">
                    Create Persona
                </CardTitle>
                <CardDescription>
                    Choose a pseudonym. No real names.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2">
                        <Label htmlFor="nickname" className="text-xs font-medium uppercase tracking-widest text-muted-foreground ml-1">Nickname</Label>
                        <div className="relative">
                            <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="nickname"
                                type="text"
                                value={nickname}
                                onChange={(e) => setNickname(e.target.value)}
                                className="pl-9"
                                placeholder="AnonymousGhost"
                                minLength={3}
                                maxLength={20}
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="bio" className="text-xs font-medium uppercase tracking-widest text-muted-foreground ml-1">Bio (Optional)</Label>
                        <div className="relative">
                            <FileText className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Textarea
                                id="bio"
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                className="pl-9 min-h-[100px] resize-none"
                                placeholder="Here to talk about stars..."
                                maxLength={120}
                            />
                            <div className="absolute right-3 bottom-3 text-xs text-muted-foreground">
                                {bio.length}/120
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                         <div className="flex justify-between items-end">
                            <Label className="text-xs font-medium uppercase tracking-widest text-muted-foreground ml-1">Looking For</Label>
                            {(session?.dailyFilterUsage !== undefined) && (
                                <span className={`text-xs font-semibold ${session.dailyFilterUsage >= 5 ? "text-destructive" : "text-primary"}`}>
                                    Free Matches Left: {Math.max(0, 5 - (session.dailyFilterUsage || 0))}/5
                                </span>
                            )}
                         </div>
                        <div className="grid grid-cols-3 gap-2">
                            {["any", "male", "female"].map((option) => {
                                const isLocked = (option !== "any") && (session?.dailyFilterUsage || 0) >= 5;
                                
                                return (
                                <Button
                                    key={option}
                                    type="button"
                                    variant={preference === option ? "default" : "outline"}
                                    onClick={() => !isLocked && setPreference(option)}
                                    className={`capitalize relative ${isLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                                    disabled={isLocked}
                                    title={isLocked ? "Daily limit reached for specific filters" : ""}
                                >
                                    {option}
                                    {isLocked && <div className="absolute inset-0 flex items-center justify-center bg-background/50 backdrop-blur-[1px] rounded-md"><span className="text-xs font-bold text-destructive">LOCKED</span></div>}
                                </Button>
                            )})}
                        </div>
                         {(session?.dailyFilterUsage || 0) >= 5 && (
                             <p className="text-xs text-muted-foreground text-center mt-2">
                                 Daily limit for specific gender matches reached. You can still match with "Any".
                             </p>
                         )}
                    </div>

                    {error && (
                        <Alert variant="destructive">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full text-lg h-12"
                    >
                        {loading ? "Saving..." : "Start Matching"}
                        {!loading && <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
