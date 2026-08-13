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
const MONGO_DB = process.env.VERIFY_MONGO_DB || "kylmo";

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

const queueState = () => {
    let entries = 0, index = 0;
    for (const key of redis("--scan --pattern 'ghosty:queue:*'").split("\n").filter(Boolean)) {
        if (key.includes(":index:")) index++;
        else entries += parseInt(redis(`llen ${key}`)) || 0;
    }
    return { entries, index };
};

const activeMatchKeys = () =>
    redis("--scan --pattern 'ghosty:activematch:*'").split("\n").filter(Boolean).length;

/** Creates a session and marks it verified, which join-queue requires. */
async function makeVerifiedSession(gender, nickname) {
    const session = await api("/api/session/init");
    execSync(
        `docker exec ghostly-mongo mongosh ${MONGO_DB} --quiet --eval ` +
        `'db.usersessions.updateOne({_id:ObjectId("${session._id}")},` +
        `{$set:{isVerified:true,gender:"${gender}",preference:"any",nickname:"${nickname}"}});'`
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
    sa.emit("join-queue");
    await new Promise((r) => setTimeout(r, 600));

    const queued = queueState();
    check("queue entry + reverse index written", queued.entries === 1 && queued.index === 1,
        JSON.stringify(queued));

    sb.emit("join-queue");
    const [ma, mb] = await Promise.all([matchedA, matchedB]);
    check("both users matched into the same room", ma.roomId === mb.roomId);
    check("partner nicknames delivered", ma.partnerNickname === "Bo" && mb.partnerNickname === "Ava",
        `${ma.partnerNickname} / ${mb.partnerNickname}`);
    check("queue drained on match", queueState().entries === 0);
    check("match state stored in Redis, not process memory", activeMatchKeys() === 2,
        `${activeMatchKeys()} keys`);

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
    check("match state cleared on disconnect", activeMatchKeys() === 0,
        `${activeMatchKeys()} keys`);

    // --- queue cleanup ---
    const dee = await makeVerifiedSession("male", "Dee");
    const sd = await connect(dee.token);
    sd.emit("join-queue");
    await new Promise((r) => setTimeout(r, 700));
    check("queued user present before disconnect", queueState().entries === 1);
    sd.disconnect();
    await new Promise((r) => setTimeout(r, 1300));
    const after = queueState();
    check("no orphaned queue entry after disconnect",
        after.entries === 0 && after.index === 0, JSON.stringify(after));

    // --- queue removal without the reverse index ---
    // The index has a 1h TTL, so the scan fallback would otherwise never run in
    // testing. Deleting the key simulates an expiry or a memory eviction.
    const faller = await makeVerifiedSession("male", "Faller");
    const sf = await connect(faller.token);
    sf.emit("join-queue");
    await new Promise((r) => setTimeout(r, 900));
    const beforeFallback = queueState();

    for (const key of redis("--scan --pattern 'ghosty:queue:index:*'").split("\n").filter(Boolean)) {
        redis(`del ${key}`);
    }

    sf.emit("leave-queue");
    await new Promise((r) => setTimeout(r, 1400));
    const afterFallback = queueState();
    check("queue entry removed even with no reverse index",
        beforeFallback.entries === 1 && afterFallback.entries === 0 && afterFallback.index === 0,
        `${beforeFallback.entries} -> ${afterFallback.entries}`);

    sb.disconnect();
    sc.disconnect();
    sf.disconnect();

    console.log(`\n  ${passed} passed, ${failed} failed\n`);
    process.exit(failed > 0 ? 1 : 0);
})().catch((err) => {
    console.error(`\n  \x1b[31merror:\x1b[0m ${err.message}\n`);
    process.exit(1);
});
