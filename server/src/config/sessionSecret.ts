/**
 * Whether a SESSION_SECRET is fit to sign production session tokens.
 *
 * The previous guard compared against exactly one string, `"supersecret"`,
 * which is the development default in env.ts. `.env.example` ships
 * `supersecret_change_me`, so the documented way to create an .env produced a
 * value the guard let through -- and that value is in git history, meaning
 * anyone with repo access could forge a session for any user.
 *
 * A length floor is the check that actually holds: every published placeholder
 * this project has used is well under it, and `openssl rand -hex 32` -- what
 * .env.example and render.yaml both tell you to use -- clears it with room to
 * spare. It is a shape check, not an entropy measurement; it cannot tell a
 * random 64 characters from 64 deliberate ones, and is not meant to.
 */

/** `openssl rand -hex 32` produces 64. Half that is still 128 bits of hex. */
const MIN_SECRET_LENGTH = 32;

export function assertUsableSessionSecret(secret: string, nodeEnv: string): void {
    if (nodeEnv !== "production") return;

    if (secret.length < MIN_SECRET_LENGTH) {
        throw new Error(
            `[Config] SESSION_SECRET must be at least ${MIN_SECRET_LENGTH} characters in ` +
                "production. Generate one with: openssl rand -hex 32"
        );
    }
}
