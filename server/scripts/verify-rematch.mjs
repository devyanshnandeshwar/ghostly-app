// Reproduces the stale-pastMatches rematch: match two users, disconnect, then
// have both rejoin inside the 60s session-cache window and see whether they are
// paired with each other again.
import { io } from "socket.io-client";
import { execSync } from "child_process";

const BASE = process.env.VERIFY_BASE || "http://localhost:3000";
const post = async (p) =>
    (await fetch(BASE + p, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).json();

const mongo = (js) =>
    execSync(`docker exec ghostly-mongo mongosh kylmo --quiet --eval '${js}'`).toString().trim();

async function verified(gender, nickname) {
    const s = await post("/api/session/init");
    mongo(`db.usersessions.updateOne({_id:ObjectId("${s._id}")},{$set:{isVerified:true,gender:"${gender}",preference:"any",nickname:"${nickname}"}});`);
    return s;
}

const connect = (token) =>
    new Promise((res, rej) => {
        const s = io(BASE, { auth: { token }, transports: ["websocket"], reconnection: false });
        s.on("connect", () => res(s));
        s.on("connect_error", rej);
    });

const waitFor = (s, ev, ms = 8000) =>
    new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error(`timeout: ${ev}`)), ms);
        s.once(ev, (d) => { clearTimeout(t); res(d); });
    });

const a = await verified("male", "Alpha");
const b = await verified("female", "Beta");

// Round 1
let sa = await connect(a.token);
let sb = await connect(b.token);
const m1a = waitFor(sa, "matched");
const m1b = waitFor(sb, "matched");
sa.emit("join-queue");
await new Promise((r) => setTimeout(r, 400));
sb.emit("join-queue");
const [r1a] = await Promise.all([m1a, m1b]);
console.log(`  round 1: Alpha matched ${r1a.partnerNickname}`);

console.log(`  mongo pastMatches after round 1:`);
console.log(`    Alpha: ${mongo(`db.usersessions.findOne({_id:ObjectId("${a._id}")},{pastMatches:1,_id:0}).pastMatches.length`)} entries`);

sa.disconnect();
sb.disconnect();
await new Promise((r) => setTimeout(r, 1500));

// Round 2, inside the 60s cache window. The cooldown is 30s, so wait past it
// but stay well inside the cache TTL.
console.log("  waiting 32s (past the 30s cooldown, inside the 60s cache TTL)...");
await new Promise((r) => setTimeout(r, 32000));

sa = await connect(a.token);
sb = await connect(b.token);
const m2a = waitFor(sa, "matched", 12000).catch(() => null);
const m2b = waitFor(sb, "matched", 12000).catch(() => null);
sa.emit("join-queue");
await new Promise((r) => setTimeout(r, 400));
sb.emit("join-queue");
const [r2a] = await Promise.all([m2a, m2b]);

sa.disconnect();
sb.disconnect();

if (r2a) {
    console.log(`\n  BUG REPRODUCED: Alpha was rematched with ${r2a.partnerNickname} despite pastMatches`);
    process.exit(1);
} else {
    console.log("\n  correct: no rematch — pastMatches was respected");
    process.exit(0);
}
