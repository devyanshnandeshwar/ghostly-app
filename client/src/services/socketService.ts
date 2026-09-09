import { io, Socket } from "socket.io-client";
import { getSessionToken } from "../utils/auth";

class SocketService {
    private static instance: SocketService;
    public socket: Socket | null = null;

    private constructor() {}

    public static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    public connect(url: string, token: string) {
        // Reuse any existing socket, connected or not. The guard used to test
        // `.connected`, so a call made while the socket was mid-reconnect --
        // which is exactly when a reconnect is in progress -- fell through and
        // built a second one, overwriting the first WITHOUT disconnecting it.
        // The orphan kept its own reconnection loop and its own server-side
        // session forever.
        //
        // That was reachable in normal use: SocketContext's effect depends on
        // [session], refreshSession() returns a fresh object every time, and
        // MatchContext calls it on every match. A match landing during a
        // network hiccup gave the user two sockets and duplicate deliveries of
        // every event.
        if (this.socket) return this.socket;

        this.socket = io(url, {
            // Callback form, not a static object. Socket.IO replays whatever is
            // here on every reconnect, so a static { token } kept presenting the
            // credential captured at first connect -- and once the server had
            // issued a new one the handshake failed for a reason nothing
            // surfaced. Reading it per handshake mirrors what the axios request
            // interceptor already does for HTTP.
            auth: (cb: (data: { token: string }) => void) =>
                cb({ token: getSessionToken() ?? token }),
            // Polling included deliberately. Forcing websocket-only meant users
            // on corporate proxies, some mobile carriers and captive networks
            // could not connect at all -- and saw nothing explaining why.
            // Socket.IO opens on polling and upgrades where it can.
            transports: ["websocket", "polling"],
            reconnectionAttempts: 5
        });

        // Swallowed on purpose per attempt -- socket.io retries on its own and
        // a log line per attempt is noise. What is NOT handled is the terminal
        // case: after reconnectionAttempts the socket gives up permanently and
        // nothing tells the user. SocketContext exposes isConnected, but no
        // component reads it yet, so a user on a network that blocks WebSockets
        // sees an app that simply never does anything. Tracked as GH-24.
        this.socket.on("connect_error", () => {});

        return this.socket;
    }

    public disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    public getSocket(): Socket | null {
        return this.socket;
    }
}

export const socketService = SocketService.getInstance();
