import { describe, expect, test } from "vitest";
import {
    generateKeyPair,
    exportKey,
    importKey,
    deriveSharedKey,
    encryptMessage,
    decryptMessage
} from "./crypto";

// The E2EE primitives had no tests, on a product whose central promise is that
// the server relays ciphertext it cannot read. These exercise the real Web
// Crypto implementation end to end rather than mocking it -- a mocked
// round-trip would prove nothing about whether two parties actually agree on a
// key.

/** The full handshake as chat performs it: both sides derive the same key. */
async function handshake() {
    const alice = await generateKeyPair();
    const bob = await generateKeyPair();

    const aliceShared = await deriveSharedKey(
        alice.privateKey,
        await importKey(await exportKey(bob.publicKey))
    );
    const bobShared = await deriveSharedKey(
        bob.privateKey,
        await importKey(await exportKey(alice.publicKey))
    );

    return { alice, bob, aliceShared, bobShared };
}

describe("key agreement", () => {
    test("both parties derive a key that decrypts the other's messages", async () => {
        const { aliceShared, bobShared } = await handshake();

        const { ciphertext, iv } = await encryptMessage("hello", aliceShared);

        expect(await decryptMessage(ciphertext, iv, bobShared)).toBe("hello");
    });

    test("a third party's key does not open the conversation", async () => {
        const { aliceShared } = await handshake();
        const eve = await generateKeyPair();
        const alice2 = await generateKeyPair();
        const eveShared = await deriveSharedKey(
            eve.privateKey,
            await importKey(await exportKey(alice2.publicKey))
        );

        const { ciphertext, iv } = await encryptMessage("secret", aliceShared);

        expect(await decryptMessage(ciphertext, iv, eveShared)).toBeNull();
    });

    test("the exported public key carries no private component", async () => {
        const { alice } = await handshake();

        const jwk = await exportKey(alice.publicKey);

        expect(jwk.d).toBeUndefined();
        expect(jwk.crv).toBe("P-256");
    });

    test("importing does not mutate the caller's JWK", async () => {
        const { alice } = await handshake();
        const jwk = await exportKey(alice.publicKey);
        const before = JSON.stringify(jwk);

        await importKey(jwk);

        expect(JSON.stringify(jwk)).toBe(before);
    });
});

describe("message encryption", () => {
    test("a fresh IV is used for every message", async () => {
        const { aliceShared } = await handshake();

        const a = await encryptMessage("same text", aliceShared);
        const b = await encryptMessage("same text", aliceShared);

        expect(a.iv).not.toBe(b.iv);
        expect(a.ciphertext).not.toBe(b.ciphertext);
    });

    test("the IV is the 12 bytes AES-GCM expects", async () => {
        const { aliceShared } = await handshake();

        const { iv } = await encryptMessage("x", aliceShared);

        expect(atob(iv).length).toBe(12);
    });

    test("the ciphertext does not contain the plaintext", async () => {
        const { aliceShared } = await handshake();

        const { ciphertext } = await encryptMessage("meet me at noon", aliceShared);

        expect(atob(ciphertext)).not.toContain("meet me at noon");
    });

    test.each([
        ["an empty message", ""],
        ["emoji and accents", "héllo 👻 مرحبا"],
        ["a newline-heavy message", "a\nb\r\nc"],
        ["the server's maximum ciphertext budget", "x".repeat(4000)]
    ])("round-trips %s", async (_label, text) => {
        const { aliceShared, bobShared } = await handshake();

        const { ciphertext, iv } = await encryptMessage(text, aliceShared);

        expect(await decryptMessage(ciphertext, iv, bobShared)).toBe(text);
    });

    // AES-GCM authenticates, so a relay that alters a byte must not be able to
    // pass the result off as plaintext.
    test("tampered ciphertext does not decrypt to anything", async () => {
        const { aliceShared, bobShared } = await handshake();
        const { ciphertext, iv } = await encryptMessage("hello", aliceShared);
        const bytes = atob(ciphertext).split("");
        bytes[0] = String.fromCharCode(bytes[0].charCodeAt(0) ^ 0xff);
        const tampered = btoa(bytes.join(""));

        expect(await decryptMessage(tampered, iv, bobShared)).toBeNull();
    });

    test("a swapped IV does not decrypt", async () => {
        const { aliceShared, bobShared } = await handshake();
        const a = await encryptMessage("hello", aliceShared);
        const b = await encryptMessage("world", aliceShared);

        expect(await decryptMessage(a.ciphertext, b.iv, bobShared)).toBeNull();
    });
});

// The regression this guards: decryptMessage used to return
// "⚠️ Decryption Failed: " + err.message, which useChatHook pushed into the
// transcript as sender: "partner" and rendered in an ordinary chat bubble. A
// failure was indistinguishable from something the other person typed, it leaked
// a raw DOMException message into the UI, and it made the caller's try/catch
// dead code because nothing ever threw. Null cannot be mistaken for text.
describe("a failure is reported as a failure", () => {
    test("returns null rather than a string that looks like a message", async () => {
        const { aliceShared, bobShared } = await handshake();
        const { iv } = await encryptMessage("hello", aliceShared);

        const result = await decryptMessage("bm90LWNpcGhlcnRleHQ=", iv, bobShared);

        expect(result).toBeNull();
    });

    test.each([
        ["ciphertext that is not base64 at all", "!!!not base64!!!", "aXZpdml2aXY="],
        ["an IV that is not base64", "AAAAAAAAAAAAAAAAAAAA", "!!!"],
        ["an empty ciphertext", "", "aXZpdml2aXY="],
        ["a truncated IV", "AAAAAAAAAAAAAAAAAAAA", "AA=="]
    ])("returns null for %s", async (_label, ciphertext, iv) => {
        const { bobShared } = await handshake();

        expect(await decryptMessage(ciphertext, iv, bobShared)).toBeNull();
    });

    // Nothing renderable may come back from a failure: a string here is a
    // string the chat would show in a bubble attributed to the partner.
    test("never returns something a chat bubble could render", async () => {
        const { bobShared } = await handshake();

        for (const [ciphertext, iv] of [
            ["!!!", "!!!"],
            ["AAAA", "AAAA"],
            ["", ""]
        ]) {
            const result = await decryptMessage(ciphertext, iv, bobShared);

            expect(result).toBeNull();
            expect(typeof result).not.toBe("string");
        }
    });
});
