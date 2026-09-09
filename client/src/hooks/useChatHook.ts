import { useEffect, useState, useRef } from "react";
import { useSocket } from "../context/SocketContext";
import { generateKeyPair, exportKey, importKey, deriveSharedKey, encryptMessage, decryptMessage } from "../utils/crypto";

export function useChat(roomId: string | null) {
    const { socket } = useSocket();
    // "system" covers room events (a partner leaving), which must not be drawn
    // as if the partner had typed them.
    /** `failed` marks a message that arrived but could not be decrypted. */
    const [messages, setMessages] = useState<
        { text: string; sender: "me" | "partner" | "system"; failed?: boolean }[]
    >([]);
    const [input, setInput] = useState("");
    const [isPartnerTyping, setIsPartnerTyping] = useState(false);
    const [isEncrypted, setIsEncrypted] = useState(false);
    
    // E2EE State
    const [keyPair, setKeyPair] = useState<CryptoKeyPair | null>(null);
    const [sharedKey, setSharedKey] = useState<CryptoKey | null>(null);
    const [partnerKey, setPartnerKey] = useState<JsonWebKey | null>(null);
    const initRef = useRef<string | null>(null);

    // Resynchronise the crypto state when the room changes, using React's
    // documented "adjusting state when a prop changes" pattern rather than an
    // effect. Doing it in an effect meant a render with the previous room's
    // sharedKey still live, which is a cascading render at best and the wrong
    // key at worst. React re-renders immediately here, before children see the
    // stale value.
    const [prevRoomId, setPrevRoomId] = useState(roomId);

    if (roomId !== prevRoomId) {
        setPrevRoomId(roomId);
        setMessages([]);
        setIsEncrypted(false);
        setSharedKey(null);
        setPartnerKey(null);
    }

    useEffect(() => {
        if (!roomId || !socket) return;
        
        // Prevent double initialization (React Strict Mode fix)
        if (initRef.current === roomId) return;
        initRef.current = roomId;

        console.log("[useChat] Joining room:", roomId);

        // keyPair is not cleared: the block above handles room-change resets, and
        // this effect regenerates it immediately below.

        // 1. Generate & Exchange Keys
        const setupEncryption = async () => {
             try {
                const keys = await generateKeyPair();
                setKeyPair(keys);
                
                const exportedPublicKey = await exportKey(keys.publicKey);
                socket.emit("exchange-key", { roomId, key: exportedPublicKey });
                console.log("[E2EE] Keys generated & sent");
             } catch (err) {
                 console.error("[E2EE] Setup failed:", err);
             }
        };

        socket.emit("join-room", roomId);
        setupEncryption();

        // No cleanup that touches listeners: this effect registers none. It used
        // to call socket.off("receive-message"/"partner-typing"/"exchange-key")
        // with no handler argument, which removes EVERY listener for those
        // events -- including the ones the effects below registered. On a room
        // change (deps include roomId) that silently tore down the partner-key
        // and typing handlers, whose own effects key on [socket] and so did not
        // re-register. Each effect below removes its own handler by reference.
        //
        // initRef is deliberately not reset: it exists to survive StrictMode's
        // double invoke within one mount, and re-init is driven by roomId changing.

    }, [roomId, socket]);
    
    // Listen for partner key - Decoupled from local key generation to prevent race conditions
    useEffect(() => {
        if (!socket) return;

        const handleExchange = (key: JsonWebKey) => {
            console.log("[E2EE] Received partner key");
            setPartnerKey(key);
        };

        socket.on("exchange-key", handleExchange);
        
        return () => {
            socket.off("exchange-key", handleExchange);
        };
    }, [socket]);

    // Derive Shared Key
    useEffect(() => {
        if (!keyPair || !partnerKey) return;

        const derive = async () => {
            try {
                const partnerKeyImported = await importKey(partnerKey);
                const shared = await deriveSharedKey(keyPair.privateKey, partnerKeyImported);
                setSharedKey(shared);
                setIsEncrypted(true);
                console.log("[E2EE] Secure connection established 🔒");
            } catch (err) {
                console.error("[E2EE] Shared key derivation failed:", err);
            }
        };

        derive();
    }, [keyPair, partnerKey]);

    // Message Handler Effect (depends on sharedKey)
    useEffect(() => {
        if (!socket || !sharedKey) return;

        const handleMessage = async (data: { message: string, iv: string }) => {
            const text = await decryptMessage(data.message, data.iv, sharedKey);

            // Null means it did not decrypt. Rendering the failure as partner
            // text -- which is what happened while decryptMessage returned its
            // own error string -- puts words in the other person's mouth and
            // leaks a DOMException message into the transcript. Mark it as what
            // it is instead, so the UI can show a gap rather than a lie.
            if (text === null) {
                console.error("[E2EE] Could not decrypt a message from the partner");
                setMessages(prev => [...prev, { text: "", sender: "partner", failed: true }]);
                return;
            }

            setMessages(prev => [...prev, { text, sender: "partner" }]);
        };

        socket.on("receive-message", handleMessage);

        return () => {
            socket.off("receive-message", handleMessage);
        };
    }, [sharedKey, socket]);

    useEffect(() => {
        if (!socket) return;
        
        const handleTyping = (typing: boolean) => {
             setIsPartnerTyping(typing);
        };

        socket.on("partner-typing", handleTyping);
        return () => { socket.off("partner-typing", handleTyping); };
    }, [socket]);

    // Typing is one bit of information, so only send it when the bit flips.
    // Emitting per keystroke cost one frame in and one fanout frame out for
    // every character typed.
    const isTypingRef = useRef(false);
    const typingIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const setTypingState = (next: boolean) => {
        if (!roomId || !socket) return;
        if (isTypingRef.current === next) return;
        isTypingRef.current = next;
        socket.emit("typing", { roomId, isTyping: next });
    };

    const handleTyping = (text: string) => {
        setInput(text);
        if (!roomId || !socket) return;

        if (typingIdleRef.current) clearTimeout(typingIdleRef.current);

        if (text.length === 0) {
            setTypingState(false);
            return;
        }

        setTypingState(true);
        // Stop the indicator if they pause, without needing another keystroke.
        typingIdleRef.current = setTimeout(() => setTypingState(false), 3000);
    };

    // Don't leave a partner staring at a stuck indicator after unmount or a
    // room change.
    useEffect(() => {
        return () => {
            if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
            isTypingRef.current = false;
        };
    }, [roomId]);

    const sendMessage = async () => {
        if (!roomId || !input.trim() || !sharedKey || !socket) return;

        console.log("[useChat] Encrypting & Sending...");
        
        try {
            const { ciphertext, iv } = await encryptMessage(input, sharedKey);
            
            socket.emit("send-message", {
                roomId,
                message: ciphertext,
                iv
            });

            // Stop typing
            if (typingIdleRef.current) clearTimeout(typingIdleRef.current);
            setTypingState(false);

            setMessages(prev => [...prev, { text: input, sender: "me" }]);
            setInput("");
        } catch (err) {
            console.error("[E2EE] Send failed:", err);
        }
    };
    
    // Deliberately does not refresh the session: the Navbar badge counts reports
    // filed AGAINST this user, and reporting someone else does not change it.
    const reportUser = (reason: string, description?: string) => {
        if (socket) {
            socket.emit("report-user", { reason, description });
            console.log("[useChat] Reported user for:", reason);
        }
    };
    
    // Listen for partner disconnection
    useEffect(() => {
        if (!socket) return;
        
        const handleDisconnect = () => {
             setMessages(prev => [...prev, { text: "Your partner left the chat.", sender: "system" }]);
             setIsEncrypted(false);
             setSharedKey(null);
        };

        socket.on("partner-disconnected", handleDisconnect);
        return () => { socket.off("partner-disconnected", handleDisconnect); };
    }, [socket]);

    return {
        messages,
        input,
        setInput: handleTyping,
        sendMessage,
        reportUser,
        isPartnerTyping,
        isEncrypted
    };
}
