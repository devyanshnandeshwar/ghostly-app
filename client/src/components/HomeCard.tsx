import { Ghost } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface HomeCardProps {
    status: "idle" | "waiting" | "matched";
    onFindMatch: () => void;
}

export function HomeCard({ status, onFindMatch }: HomeCardProps) {
    return (
        <Card className="w-full max-w-lg mx-auto border-border/50 shadow-xl animate-in fade-in zoom-in-95 duration-500">
            <CardHeader className="text-center space-y-2">
                <CardTitle className="text-2xl">
                    {status === "waiting" ? "Finding Partner" : "Ready to Connect?"}
                </CardTitle>
                <CardDescription>
                    {status === "waiting" ? "Searching for a compatible match..." : "Match with verified users anonymously."}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 flex flex-col items-center pb-4">
                <div className="relative h-48 w-48 mx-auto flex items-center justify-center">
                    {status === "waiting" && (
                        <>
                            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-75" />
                            <div className="absolute inset-0 border-2 border-primary/50 rounded-full border-t-transparent animate-spin" />
                        </>
                    )}
                    <div className="bg-card p-6 rounded-full shadow-lg z-10 border border-border">
                        <Ghost size={48} className={status === "waiting" ? "text-primary animate-pulse" : "text-muted-foreground"} />
                    </div>
                </div>

                {status === "waiting" ? (
                    <p className="text-primary font-medium animate-pulse">Looking for a match...</p>
                ) : (
                    <Button
                        onClick={onFindMatch}
                        className="w-full py-6 text-lg"
                        size="lg"
                    >
                        Find Match
                    </Button>
                )}
            </CardContent>
        </Card>
    );
}
