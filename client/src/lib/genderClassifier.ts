/**
 * On-device gender classification for the verification step.
 *
 * The camera frame never leaves the browser: MediaPipe finds the face
 * (see useFaceFraming), this crops and classifies it, and only the resulting
 * label is sent to the server.
 *
 * Be clear about what that means. The server records this answer rather than
 * checking it, so a client can assert whatever it likes -- see the trust model
 * section in DOCUMENTATION.md. This module is a convenience for honest users,
 * not a control.
 */

// Vendored from @vladmandic/face-api@1.7.15, which is why that dependency is
// pinned exactly. BASE_URL rather than a leading "/" because VITE_BASE_PATH is
// a build arg. face-api appends the manifest filename to this directory itself.
const MODEL_URI = `${import.meta.env.BASE_URL}face-api/1.7.15`;

export interface GenderResult {
    gender: "male" | "female";
    confidence: number;
}

let loadPromise: Promise<void> | null = null;

/**
 * Idempotent. Safe to call early to warm the cache and again at capture time --
 * the second caller awaits the first load rather than starting another.
 */
export function loadGenderClassifier(): Promise<void> {
    if (!loadPromise) {
        loadPromise = (async () => {
            const faceapi = await import("@vladmandic/face-api");
            // Only the age/gender net is vendored. face-api's own detectors are
            // never loaded: MediaPipe already produces the face box, so pulling
            // a second detector would be ~6MB of weights for nothing.
            await faceapi.nets.ageGenderNet.loadFromUri(MODEL_URI);

            // Warm the tfjs backend with one throwaway pass. Measured: the first
            // prediction costs ~1.8s cold (backend init plus kernel compilation)
            // and ~25ms after that. Without this the user pays that 1.8s staring
            // at "Checking" right after pressing capture; with it, the cost lands
            // during the profile step where nothing is waiting on it.
            // Best-effort -- a warmup failure must not fail the load.
            try {
                const warm = document.createElement("canvas");
                warm.width = 64;
                warm.height = 64;
                await faceapi.nets.ageGenderNet.predictAgeAndGender(warm);
            } catch (err) {
                console.warn("[genderClassifier] warmup skipped:", err);
            }

            console.log("[genderClassifier] model ready");
        })().catch((err) => {
            // Reset so a later attempt can retry rather than inheriting the
            // rejection forever.
            loadPromise = null;
            console.warn("[genderClassifier] load failed:", err);
            throw err;
        });
    }

    return loadPromise;
}

/**
 * Returns null on any failure -- a missing model, a decode error, an
 * unrecognised label. Callers surface that as a retryable capture error rather
 * than stranding the user.
 */
export async function classifyGender(input: HTMLCanvasElement): Promise<GenderResult | null> {
    try {
        await loadGenderClassifier();

        const faceapi = await import("@vladmandic/face-api");
        const prediction = await faceapi.nets.ageGenderNet.predictAgeAndGender(input);

        // The signature is `AgeAndGenderPrediction | AgeAndGenderPrediction[]`:
        // it returns an array only for batched tensor input, but narrowing here
        // is cheaper than being surprised by it.
        const result = Array.isArray(prediction) ? prediction[0] : prediction;

        if (!result) return null;

        // Gender is a string union at runtime, and it is about to become a
        // database value, so check it rather than casting.
        if (result.gender !== "male" && result.gender !== "female") {
            console.warn("[genderClassifier] unexpected label:", result.gender);
            return null;
        }

        return { gender: result.gender, confidence: result.genderProbability };
    } catch (err) {
        console.warn("[genderClassifier] classification failed:", err);
        return null;
    }
}
