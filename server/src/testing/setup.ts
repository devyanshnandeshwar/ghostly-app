// Preloaded before any test file. See bunfig.toml.
//
// These assign unconditionally (`=`, not `??=`). Bun loads .env automatically
// before this file runs, so every key here was ALREADY set from the developer's
// real .env by the time we got here, and `??=` kept that value -- which defeated
// the entire point of the file. Measured before this was fixed: REDIS_URL
// reached the suite as the live Upstash URL and MONGO_URI as the live Atlas
// cluster. "Deliberately a dead port" was running against production, and a
// test that escaped its fake would have written to real data rather than
// failing loudly.
process.env.NODE_ENV = "test";
// Pinned so token signatures are stable across machines.
process.env.SESSION_SECRET = "test-session-secret";
// Silences the config warning; no test connects to Mongo.
process.env.MONGO_URI = "mongodb://127.0.0.1:27017/ghostly-test-unused";
// Deliberately a dead port: a test that escapes the fake should fail loudly
// rather than mutate a real dev database.
process.env.REDIS_URL = "redis://127.0.0.1:6399";
// Pinned so tests that touch admin auth or CORS do not read the developer's
// real .env and pass or fail depending on the machine they run on.
process.env.ADMIN_TOKEN = "test-admin-token";
process.env.CLIENT_URL = "https://test.example.com";
