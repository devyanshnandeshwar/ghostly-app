export interface ServerToClientEvents {
    // Auth
    "auth-error": (message: string) => void;
    "auth-success": (data: { sid: string }) => void;

    // Queue
    "queue-error": (message: string) => void;
    "queue-waiting": () => void;
    "queue-cooldown": (data: { remaining: number }) => void;
    "matched": (data: { roomId: string; partnerNickname: string; partnerBio: string }) => void;

    // Chat
    "receive-message": (data: { message: string; iv: string }) => void;
    "partner-typing": (isTyping: boolean) => void;
    "partner-disconnected": () => void;
    
    // E2EE
    "exchange-key": (key: JsonWebKey) => void;
}

export interface ClientToServerEvents {
    // Queue
    "join-queue": () => void;
    "leave-queue": () => void;

    // Chat
    "join-room": (roomId: string) => void;
    "send-message": (data: { roomId: string; message: string; iv: string }) => void;
    "typing": (data: { roomId: string; isTyping: boolean }) => void;
    "report-user": (data: { reason: string; description?: string }) => void;
    
    // E2EE
    "exchange-key": (data: { roomId: string; key: JsonWebKey }) => void;
}
