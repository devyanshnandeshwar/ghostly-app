// Preloaded before any test file. See bunfig.toml.
process.env.NODE_ENV ??= "test";
// Pinned so token signatures are stable across machines.
process.env.SESSION_SECRET ??= "test-session-secret";
// Silences the config warning; no test connects to Mongo.
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/ghostly-test-unused";
// Deliberately a dead port: a test that escapes the fake should fail loudly
// rather than mutate a real dev database.
process.env.REDIS_URL ??= "redis://127.0.0.1:6399";
// Pinned so tests that touch admin auth or CORS do not read the developer's
// real .env and pass or fail depending on the machine they run on.
process.env.ADMIN_TOKEN ??= "test-admin-token";
process.env.CLIENT_URL ??= "https://test.example.com";
