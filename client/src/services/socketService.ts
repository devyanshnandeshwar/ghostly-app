import { io, Socket } from "socket.io-client";

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
        if (this.socket && this.socket.connected) return this.socket;

        this.socket = io(url, {
            auth: { token },
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
