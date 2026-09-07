/**
 * Socket-level end-to-end checks: matchmaking, E2EE key exchange, message
 * relay, room authorization, and queue cleanup.
 *
 * Run through scripts/verify-local.sh, which brings the stack up first.
 * Requires socket.io-client, so it runs from the server package.
 */
import { io } from "socket.io-client";
import { execSync } from "child_process";

const BASE = process.env.VERIFY_BASE || "http://localhost:3000";
const HOST = process.env.VERIFY_HOST || "localhost";
// Must match the database in the server's MONGO_URI. A mismatch is silent and
// baffling: the fixtures write to one database, the server reads another, and
// every match attempt fails a gate the fixture thought it had satisfied.
// Defaults to the name in server/.env.example rather than the old prod name.
const MONGO_DB = process.env.VERIFY_MONGO_DB || "ghostly";

let passed = 0;
let failed = 0;

function check(label, ok, detail = "") {
    if (ok) {
        passed++;
        console.log(`  \x1b[32mPASS\x1b[0m  ${label}${detail ? "  " + detail : ""}`);
    } else {
        failed++;
        console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? "  " + detail : ""}`);
    }
}

const api = async (path) =>
    (await fetch(BASE + path, {
        method: "POST",
        headers: { Host: HOST, "Content-Type": "application/json" },
        body: "{}"
    })).json();

const waitFor = (sock, event, ms = 9000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
        sock.once(event, (data) => { clearTimeout(timer); resolve(data); });
    });

const connect = (token) =>
    new Promise((resolve, reject) => {
        const sock = io(BASE, {
            extraHeaders: { Host: HOST },
            auth: { token },
            transports: ["websocket"],
            reconnection: false
        });
        sock.on("connect", () => resolve(sock));
        sock.on("connect_error", (err) => reject(new Error(err.message)));
        sock.on("queue-error", (msg) => console.log(`        (queue-error: ${msg})`));
    });

const redis = (cmd) =>
    execSync(`docker exec ghostly-redis redis-cli ${cmd}`).toString().trim();

// The queue and presence moved into the server process, so Redis can no longer
// observe them and these helpers now assert the opposite of what they used to:
// that NOTHING queue-shaped is left in Redis. Behaviour that used to be checked
// by reading Redis directly -- an entry appearing on join, disappearing on
// disconnect -- is now covered by unit tests against the store itself
// (queue.store.test.ts), which can assert it far more precisely than a scan.
const strayQueueKeys = () =>
    redis("--scan --pattern 'ghosty:queue:*'").split("\n").filter(Boolean).length;

const strayPresenceKeys = () =>
    redis("--scan --pattern 'ghosty:activematch:*'").split("\n").filter(Boolean).length;

/**
 * Creates a session ready to enter the queue.
 *
 * join-queue gates on three things now: a confirmed age, verification, and an
 * account status of "active". Setting only isVerified leaves the age gate
 * closed and every match attempt fails with "Please confirm your age".
 */
async function makeVerifiedSession(gender, nickname) {
    const session = await api("/api/v1/session/init");
    execSync(
        `docker exec ghostly-mongo mongosh ${MONGO_DB} --quiet --eval ` +
        `'db.usersessions.updateOne({_id:ObjectId("${session._id}")},` +
        `{$set:{isVerified:true,gender:"${gender}",preference:"any",nickname:"${nickname}",` +
        `status:"active",ageConfirmedAt:new Date(),birthDate:new Date("1990-01-01")}});'`
    );
    return session;
}

(async () => {
    console.log("\n\x1b[1mSocket and matchmaking\x1b[0m");

    // --- authentication ---
    let rejected = false;
    try { await connect("not-a-signed-token"); } catch { rejected = true; }
    check("unsigned token rejected at handshake", rejected);

    rejected = false;
    try { await connect("v1.ZXZpbA.forgedsignature"); } catch { rejected = true; }
    check("forged signature rejected at handshake", rejected);

    // --- matchmaking ---
    const a = await makeVerifiedSession("male", "Ava");
    const b = await makeVerifiedSession("female", "Bo");
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    check("two verified sessions connected", true);

    const matchedA = waitFor(sa, "matched");
    const matchedB = waitFor(sb, "matched");

    const waitingA = { settled: false };
    sa.once("queue-waiting", () => { waitingA.settled = true; });

    sa.emit("join-queue");
    await new Promise((r) => setTimeout(r, 600));

    // Observable rather than inspected: the queue is in-process now, so the
    // proof that someone is waiting is that the server said so.
    check("first joiner is told they are waiting", waitingA.settled === true,
        waitingA.settled ? "" : "no queue-waiting received");

    sb.emit("join-queue");
    const [ma, mb] = await Promise.all([matchedA, matchedB]);
    check("both users matched into the same room", ma.roomId === mb.roomId);
    check("partner nicknames delivered", ma.partnerNickname === "Bo" && mb.partnerNickname === "Ava",
        `${ma.partnerNickname} / ${mb.partnerNickname}`);
    // Inverted deliberately. This used to assert presence WAS in Redis so a
    // second instance could read it; the deployment runs one instance and a
    // spin-down destroys every socket, so a Redis row describing a socket
    // outlives the socket. Now the assertion is that nothing leaked there.
    check("no presence state left in Redis", strayPresenceKeys() === 0,
        `${strayPresenceKeys()} keys`);
    check("no queue state left in Redis", strayQueueKeys() === 0,
        `${strayQueueKeys()} keys`);

    // --- E2EE ---
    sa.emit("join-room", ma.roomId);
    sb.emit("join-room", mb.roomId);
    await new Promise((r) => setTimeout(r, 500));

    const keyA = waitFor(sa, "exchange-key");
    const keyB = waitFor(sb, "exchange-key");
    sa.emit("exchange-key", { roomId: ma.roomId, key: { kty: "EC", x: "AAA" } });
    await new Promise((r) => setTimeout(r, 400));
    sb.emit("exchange-key", { roomId: mb.roomId, key: { kty: "EC", x: "CCC" } });
    const [ka, kb] = await Promise.all([keyA, keyB]);
    check("ECDH public keys crossed correctly", ka.x === "CCC" && kb.x === "AAA");

    const gotMessage = waitFor(sb, "receive-message");
    sa.emit("send-message", { roomId: ma.roomId, message: "CIPHERTEXT-XYZ", iv: "IV123" });
    const msg = await gotMessage;
    check("ciphertext and IV relayed intact",
        msg.message === "CIPHERTEXT-XYZ" && msg.iv === "IV123");

    const typing = waitFor(sb, "partner-typing");
    sa.emit("typing", { roomId: ma.roomId, isTyping: true });
    check("typing indicator relayed", (await typing) === true);

    // --- room authorization ---
    const outsider = await makeVerifiedSession("male", "Eve");
    const sc = await connect(outsider.token);
    let injected = false;
    sb.once("receive-message", () => { injected = true; });
    sc.emit("send-message", { roomId: ma.roomId, message: "INJECTED", iv: "x" });
    sc.emit("exchange-key", { roomId: ma.roomId, key: { kty: "EC", x: "EVIL" } });
    sc.emit("typing", { roomId: ma.roomId, isTyping: true });
    await new Promise((r) => setTimeout(r, 1000));
    check("unmatched socket cannot inject into a room", !injected);

    // --- teardown ---
    const partnerLeft = waitFor(sb, "partner-left", 5000).catch(() => null);
    sa.disconnect();
    await partnerLeft;
    await new Promise((r) => setTimeout(r, 1200));
    // The partner-left event above is the real proof the match was torn down;
    // this only confirms nothing was written to Redis on the way.
    check("disconnect leaves no presence state in Redis", strayPresenceKeys() === 0,
        `${strayPresenceKeys()} keys`);

    // --- queue cleanup ---
    // Behavioural: if a disconnected user were left in the queue, the next
    // joiner would be matched with a socket that no longer exists and would sit
    // in a chat whose partner never speaks. So the check is that the next
    // joiner waits rather than matches.
    const dee = await makeVerifiedSession("male", "Dee");
    const sd = await connect(dee.token);
    const deeWaiting = waitFor(sd, "queue-waiting");
    sd.emit("join-queue");
    await deeWaiting;
    sd.disconnect();
    await new Promise((r) => setTimeout(r, 800));

    const eve = await makeVerifiedSession("female", "Eve");
    const se = await connect(eve.token);
    let eveMatched = false;
    se.on("matched", () => { eveMatched = true; });
    const eveWaiting = waitFor(se, "queue-waiting");
    se.emit("join-queue");
    await eveWaiting;
    check("a disconnected user is not offered as a match", eveMatched === false);
    check("nothing queue-shaped left in Redis", strayQueueKeys() === 0,
        `${strayQueueKeys()} keys`);

    se.disconnect();

    sb.disconnect();
    sc.disconnect();

    console.log(`\n  ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
    console.error(`\n  \x1b[31merror:\x1b[0m ${err.message}\n`);
    process.exit(1);
});
