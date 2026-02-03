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

    public connect(url: string, deviceId: string) {
        if (this.socket && this.socket.connected) return this.socket;

        this.socket = io(url, {
            auth: { deviceId },
            transports: ["websocket"],
            reconnectionAttempts: 5
        });

        this.socket.on("connect", () => {
            // console.log("[SocketService] Connected:", this.socket?.id);
        });

        this.socket.on("connect_error", (_err) => {
            // console.error("[SocketService] Connection Error:", err);
        });

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
