import { useRef, useEffect, useState } from "react";
import { useChat } from "../hooks/useChatHook";
import { useMatch } from "../context/MatchContext";
import ReportModal from "./ReportModal";
import { Send, LogOut, User, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface ChatProps {
    roomId: string;
    partner: { nickname: string; bio: string } | null;
}

export default function Chat({ roomId, partner }: ChatProps) {
    const { messages, input, setInput, sendMessage, reportUser, isPartnerTyping, isEncrypted } = useChat(roomId);
    const { leaveMatch, nextMatch } = useMatch();
    const [reported, setReported] = useState(false);
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom whenever messages change
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isPartnerTyping]);

    const handleReportSubmit = (reason: string, description: string) => {
        reportUser(reason, description);
        setIsReportModalOpen(false);
        setReported(true);
        setTimeout(() => setReported(false), 2000);
    };

    return (
        <Card className="w-full max-w-2xl mx-auto h-[85vh] sm:h-[80vh] min-h-[500px] sm:min-h-[600px] flex flex-col border-border/50 shadow-2xl relative overflow-hidden py-0 gap-0">
             {/* Report Toast */}
            {reported && (
                <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-full text-sm font-medium z-50 flex items-center gap-2 shadow-lg animate-in slide-in-from-top-2 fade-in duration-300">
                    <span>User Reported</span>
                </div>
            )}

            {/* Header */}
            <div className="p-3 border-b flex justify-between items-center bg-card/50 backdrop-blur">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Avatar className="h-10 w-10 ring-2 ring-background">
                            <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-white">
                                <User className="h-5 w-5" />
                            </AvatarFallback>
                        </Avatar>
                        {isEncrypted && (
                            <div className="absolute -bottom-0.5 -right-0.5 bg-green-500 rounded-full p-0.5 border-2 border-background" title="End-to-End Encrypted">
                                <Shield className="h-2.5 w-2.5 text-white fill-current" />
                            </div>
                        )}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                             <h3 className="font-semibold leading-none">
                                {partner?.nickname || "Stranger"}
                            </h3>
                            {isEncrypted && <Badge variant="outline" className="text-[10px] h-4 px-1 gap-0.5 border-green-500/30 text-green-500"><Shield className="h-2 w-2" /> E2EE</Badge>}
                        </div>
                       
                        {partner?.bio ? (
                            <p className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-[200px] mt-1">
                                {partner.bio}
                            </p>
                        ) : (
                             <span className="text-xs text-green-500 flex items-center gap-1.5 font-medium mt-1">
                                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                Online
                             </span>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsReportModalOpen(true)}
                        className="text-muted-foreground hover:text-destructive"
                        title="Report User"
                    >
                         <Shield className="h-5 w-5" />
                    </Button>
                    
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={leaveMatch}
                        className="gap-2"
                        title="Leave Chat & Return Home"
                    >
                        <LogOut className="h-4 w-4" />
                        <span className="hidden sm:inline">Leave</span>
                    </Button>

                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={nextMatch}
                        className="gap-2"
                        title="Skip to Next Match"
                    >
                        <span className="hidden sm:inline">Next</span>
                        <ArrowRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4">
                 <div className="space-y-4 min-h-full flex flex-col justify-end">
                    {messages.map((msg, i) => (
                        <div
                            key={i}
                            className={`flex w-full ${msg.sender === "me" ? "justify-end" : "justify-start"} animate-in slide-in-from-bottom-2 fade-in duration-300`}
                        >
                            <div className={`
                                max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm break-words
                                ${msg.sender === "me" 
                                    ? "bg-primary text-primary-foreground rounded-br-none" 
                                    : "bg-muted text-muted-foreground rounded-bl-none"}
                            `}>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    
                    {isPartnerTyping && (
                         <div className="flex justify-start animate-in fade-in duration-300">
                             <div className="bg-muted px-4 py-3 rounded-2xl rounded-bl-none flex items-center gap-1">
                                 <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                 <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                 <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" />
                             </div>
                        </div>
                    )}
                    <div ref={scrollRef} className="h-px" />
                </div>
            </ScrollArea>

            {/* Input */}
            <div className="p-3 bg-background/50 backdrop-blur border-t border-border flex gap-2">
                <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && isEncrypted && sendMessage()}
                    placeholder={isEncrypted ? "Type a message..." : "Connecting..."}
                    className="flex-1"
                    autoFocus
                    disabled={!isEncrypted}
                />
                <Button
                    onClick={sendMessage}
                    disabled={!input.trim() || !isEncrypted}
                    size="icon"
                >
                    <Send className="h-5 w-5" />
                </Button>
            </div>
            
            <ReportModal 
                isOpen={isReportModalOpen} 
                onClose={() => setIsReportModalOpen(false)} 
                onSubmit={handleReportSubmit} 
            />
        </Card>
    );
}
