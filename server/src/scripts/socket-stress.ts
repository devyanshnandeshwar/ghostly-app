import { io } from "socket.io-client";

const URL = "http://localhost:5000";
const CONNECTIONS = 100;
const DURATION_MS = 10000;

console.log(`Starting Socket Stress Test: ${CONNECTIONS} connections...`);

let active = 0;

for (let i = 0; i < CONNECTIONS; i++) {
    setTimeout(() => {
        const socket = io(URL, {
            auth: { deviceId: `stress-test-${i}` },
            transports: ["websocket"]
        });

        socket.on("connect", () => {
            active++;
            process.stdout.write(`\rActive Connections: ${active}   `);
            
            // Randomly disconnect to test cleanup
            setTimeout(() => {
                socket.disconnect();
                active--;
                process.stdout.write(`\rActive Connections: ${active}   `);
            }, Math.random() * DURATION_MS);
        });

        socket.on("connect_error", (err) => {
            // Ignore expected rate limit errors
            if (err.message !== "Too many connection attempts. Please try again later.") {
                // console.error(`Conn Error: ${err.message}`);
            }
        });

    }, i * 50); // Stagger connections
}

setTimeout(() => {
    console.log("\n\nTest Finished. Monitor server memory/logs to ensure no leaks.");
}, DURATION_MS + 2000);
