/**
 * Web Crypto API Utils for E2EE
 * Uses ECDH (P-256) for Key Exchange
 * Uses AES-GCM (256-bit) for Message Encryption
 */

// Generate ECDH Key Pair
export async function generateKeyPair(): Promise<CryptoKeyPair> {
    return await window.crypto.subtle.generateKey(
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        ["deriveKey"]
    );
}

// Export Public Key (to send to partner)
export async function exportKey(key: CryptoKey): Promise<JsonWebKey> {
    return await window.crypto.subtle.exportKey("jwk", key);
}

// Import Partner's Public Key
export async function importKey(jwk: JsonWebKey): Promise<CryptoKey> {
    // Sanitize JWK to avoid import errors on some browsers
    const cleanJwk = { ...jwk };
    delete cleanJwk.key_ops;
    delete cleanJwk.ext;
    
    return await window.crypto.subtle.importKey(
        "jwk",
        cleanJwk,
        {
            name: "ECDH",
            namedCurve: "P-256"
        },
        true,
        [] 
    );
}

// Derive Shared AES-GCM Key
export async function deriveSharedKey(
    privateKey: CryptoKey,
    publicKey: CryptoKey
): Promise<CryptoKey> {
    return await window.crypto.subtle.deriveKey(
        {
            name: "ECDH",
            public: publicKey
        },
        privateKey,
        {
            name: "AES-GCM",
            length: 256
        },
        true,
        ["encrypt", "decrypt"]
    );
}

// Encrypt Message (AES-GCM)
export async function encryptMessage(
    text: string,
    key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Generate random IV (12 bytes for GCM)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        key,
        data
    );

    return {
        ciphertext: arrayBufferToBase64(encryptedBuffer),
        iv: arrayBufferToBase64(iv.buffer)
    };
}

// Decrypt Message (AES-GCM)
export async function decryptMessage(
    ciphertext: string,
    iv: string,
    key: CryptoKey
): Promise<string> {
    try {
        const encryptedData = base64ToArrayBuffer(ciphertext);
        const ivData = base64ToArrayBuffer(iv);



        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: new Uint8Array(ivData)
            },
            key,
            encryptedData
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    } catch (err: any) {
        // console.error("Decryption failed:", err);
        // console.error("Ciphertext:", ciphertext);
        // console.error("IV:", iv);
        return "⚠️ Decryption Failed: " + (err.message || "Key Mismatch");
    }
}

// Helpers
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary_string = window.atob(base64);
    const len = binary_string.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}
