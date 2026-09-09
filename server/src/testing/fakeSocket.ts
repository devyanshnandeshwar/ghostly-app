/**
 * A Socket.IO-shaped double for handler tests.
 *
 * Socket handlers need no transport to exercise -- they are closures over
 * (io, socket). What they DO need is a double that dispatches events the way
 * the real thing does, including calling a listener with no arguments at all,
 * because that is the case that used to end the process.
 */

export interface EmittedEvent {
    event: string;
    args: unknown[];
}

export class FakeSocket {
    readonly id: string;
    data: any;
    readonly emitted: EmittedEvent[] = [];
    readonly rooms = new Set<string>();
    /** Events emitted to the room rather than this socket. */
    readonly roomEmits: (EmittedEvent & { room: string })[] = [];
    readonly listeners = new Map<string, ((...args: any[]) => void)[]>();
    disconnected = false;

    constructor(id = "socket-1", data: any = {}) {
        this.id = id;
        this.data = data;
    }

    on(event: string, handler: (...args: any[]) => void) {
        const existing = this.listeners.get(event) ?? [];
        existing.push(handler);
        this.listeners.set(event, existing);
        return this;
    }

    emit(event: string, ...args: unknown[]) {
        this.emitted.push({ event, args });
        return true;
    }

    to(room: string) {
        return {
            emit: (event: string, ...args: unknown[]) => {
                this.roomEmits.push({ room, event, args });
                return true;
            }
        };
    }

    join(room: string) {
        this.rooms.add(room);
    }

    leave(room: string) {
        this.rooms.delete(room);
    }

    disconnect() {
        this.disconnected = true;
    }

    /**
     * Dispatch as Socket.IO does. `args` spread with nothing in it calls the
     * listener with zero arguments, which is exactly what a client sending
     * `socket.emit("send-message")` produces on the server.
     */
    dispatch(event: string, ...args: unknown[]): void {
        for (const handler of this.listeners.get(event) ?? []) {
            handler(...args);
        }
    }

    lastEmit(event: string) {
        return [...this.emitted].reverse().find((e) => e.event === event);
    }
}

/** Minimal `io` double: enough for socketsJoin / fetchSockets / to(). */
export class FakeIo {
    readonly roomEmits: (EmittedEvent & { room: string })[] = [];
    sockets: FakeSocket[] = [];

    constructor(sockets: FakeSocket[] = []) {
        this.sockets = sockets;
    }

    in(room: string) {
        return {
            socketsJoin: async (target: string) => {
                for (const s of this.sockets) if (s.id === room) s.join(target);
            },
            fetchSockets: async () => this.sockets.filter((s) => s.rooms.has(room))
        };
    }

    to(room: string) {
        return {
            emit: (event: string, ...args: unknown[]) => {
                this.roomEmits.push({ room, event, args });
                return true;
            }
        };
    }
}

/**
 * Runs `fn` while watching for an unhandled promise rejection, which is the
 * failure this whole area is about: Node and Bun both exit non-zero on one, so
 * in production it is not a logged warning but a dropped process.
 */
export async function unhandledRejectionsDuring(fn: () => void | Promise<void>): Promise<unknown[]> {
    const seen: unknown[] = [];
    const onRejection = (reason: unknown) => seen.push(reason);

    process.on("unhandledRejection", onRejection);
    try {
        await fn();
        // Let any rejection that is going to go unhandled actually surface.
        await new Promise((resolve) => setTimeout(resolve, 10));
    } finally {
        process.off("unhandledRejection", onRejection);
    }

    return seen;
}
