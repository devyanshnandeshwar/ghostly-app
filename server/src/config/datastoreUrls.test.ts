import { describe, expect, test } from "bun:test";
import { assertUsableDatastoreUrls } from "./datastoreUrls";

const PROD = "production";

describe("assertUsableDatastoreUrls outside production", () => {
    // Localhost defaults are the whole point of local development.
    test("permits the localhost defaults", () => {
        expect(() =>
            assertUsableDatastoreUrls(
                "mongodb://localhost:27017/ghostly",
                "redis://localhost:6379",
                "development"
            )
        ).not.toThrow();
    });

    test("permits the dead port the test suite pins", () => {
        expect(() =>
            assertUsableDatastoreUrls(
                "mongodb://127.0.0.1:27017/ghostly-test-unused",
                "redis://127.0.0.1:6399",
                "test"
            )
        ).not.toThrow();
    });
});

describe("assertUsableDatastoreUrls in production", () => {
    const goodMongo = "mongodb+srv://user:pw@cluster0.example.mongodb.net/";
    const goodRedis = "rediss://default:token@example.upstash.io:6379";

    test("accepts a real pair", () => {
        expect(() =>
            assertUsableDatastoreUrls(goodMongo, goodRedis, PROD)
        ).not.toThrow();
    });

    // The actual production failure: MONGO_URI unset only console.warn'd, then
    // env.ts silently substituted the localhost default. On Render that is a
    // 30-second server-selection stall followed by exit(1), with a message
    // about a cluster nobody configured.
    test("rejects a MONGO_URI left at the localhost default", () => {
        expect(() =>
            assertUsableDatastoreUrls(
                "mongodb://localhost:27017/ghostly",
                goodRedis,
                PROD
            )
        ).toThrow(/MONGO_URI/);
    });

    // Worse than Mongo's version, because Redis has no validation at all today:
    // the default is silently substituted and, before the boot timeout existed,
    // the process then hung forever without ever opening a port.
    test("rejects a REDIS_URL left at the localhost default", () => {
        expect(() =>
            assertUsableDatastoreUrls(goodMongo, "redis://localhost:6379", PROD)
        ).toThrow(/REDIS_URL/);
    });

    test("rejects loopback by IP, not just by the name localhost", () => {
        expect(() =>
            assertUsableDatastoreUrls(
                "mongodb://127.0.0.1:27017/ghostly",
                goodRedis,
                PROD
            )
        ).toThrow(/MONGO_URI/);
    });

    test("rejects an empty value", () => {
        expect(() => assertUsableDatastoreUrls("", goodRedis, PROD)).toThrow(
            /MONGO_URI/
        );
        expect(() => assertUsableDatastoreUrls(goodMongo, "", PROD)).toThrow(
            /REDIS_URL/
        );
    });

    // Upstash accepts the TCP handshake on a plaintext connection and then
    // closes it, which node-redis reports as "Socket closed unexpectedly" and
    // retries forever. Diagnosed the slow way once; caught at boot from now on.
    test("rejects a plaintext redis:// URL pointing at a remote host", () => {
        expect(() =>
            assertUsableDatastoreUrls(
                goodMongo,
                "redis://default:token@example.upstash.io:6379",
                PROD
            )
        ).toThrow(/rediss:/);
    });

    test("names every offending variable at once, not just the first", () => {
        expect(() =>
            assertUsableDatastoreUrls(
                "mongodb://localhost:27017/ghostly",
                "redis://localhost:6379",
                PROD
            )
        ).toThrow(/MONGO_URI[\s\S]*REDIS_URL|REDIS_URL[\s\S]*MONGO_URI/);
    });
});
