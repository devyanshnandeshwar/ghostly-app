// Preloaded before any test file. See bunfig.toml.
process.env.NODE_ENV ??= "test";
// Pinned so token signatures are stable across machines.
process.env.SESSION_SECRET ??= "test-session-secret";
// Silences the config warning; no test connects to Mongo.
process.env.MONGO_URI ??= "mongodb://127.0.0.1:27017/ghostly-test-unused";
// Deliberately a dead port: a test that escapes the fake should fail loudly
// rather than mutate a real dev database.
process.env.REDIS_URL ??= "redis://127.0.0.1:6399";
