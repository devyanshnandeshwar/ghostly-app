import axios from "axios";
import FormData from "form-data";
import http from "http";
import { logger } from "../utils/logger";

const AI_SERVICE_URL =
    process.env.AI_MODEL_URL || "http://localhost:8000/api/verify-gender";

// Use a keep-alive HTTP agent to reuse TCP connections
// This significantly reduces the latency of repeated requests to the AI service
const httpAgent = new http.Agent({ keepAlive: true });

const aiClient = axios.create({
    httpAgent,
    timeout: 5000, // 5s timeout
});

/**
 * The AI service rejected the image itself (no face, undecodable, too large).
 * Deterministic: retrying the same bytes cannot help, and the reason is worth
 * showing the user rather than hiding behind "service unavailable".
 */
export class AIImageError extends Error {
    constructor(message: string, public status: number) {
        super(message);
        this.name = "AIImageError";
    }
}

function asImageError(error: any): AIImageError | null {
    const response = error?.response;
    if (!response || response.status < 400 || response.status >= 500) return null;

    const data = response.data || {};
    const detail =
        data.error ||
        (typeof data.detail === "string" ? data.detail : null) ||
        "Image could not be processed";

    return new AIImageError(detail, response.status);
}

export async function verifyGender(imageBuffer: Buffer) {
    try {
        const form = new FormData();
        form.append("image", imageBuffer, { filename: "upload.jpg" });

        const response = await aiClient.post(AI_SERVICE_URL, form, {
            headers: {
                ...form.getHeaders()
            }
        });

        return {
            gender: response.data.gender,
            confidence: response.data.confidence
        };
    } catch (error: any) {
        // A 4xx means the image was rejected, not that the service is down.
        // Surface it as-is instead of burning a retry on the same bytes.
        const imageError = asImageError(error);
        if (imageError) {
            logger.info(`[AI Bridge] Image rejected (${imageError.status}): ${imageError.message}`);
            throw imageError;
        }

        logger.error("[AI Bridge] Attempt 1 Failed:", error.message);
        if (error.response) {
            logger.error("[AI Bridge] Response Status:", error.response.status);
            logger.error("[AI Bridge] Response Data:", error.response.data);
        } else if (error.code === "ECONNREFUSED") {
             logger.error("[AI Bridge] Connection Refused - Is python server running on port 8000?");
        }

        // Retry logic: Attempt once more
        try {
            logger.info("[AI Bridge] Retrying request...");
            const formRetry = new FormData();
            formRetry.append("image", imageBuffer, { filename: "retry.jpg" });

            const responseRetry = await aiClient.post(AI_SERVICE_URL, formRetry, {
                headers: {
                    ...formRetry.getHeaders()
                }
            });

             return {
                gender: responseRetry.data.gender,
                confidence: responseRetry.data.confidence
            };

        } catch (retryError: any) {
             const retryImageError = asImageError(retryError);
             if (retryImageError) {
                 throw retryImageError;
             }

             logger.error("[AI Bridge] Retry Failed:", retryError.message);
             if (retryError.response) {
                logger.error("[AI Bridge] Retry Response Data:", retryError.response.data);
            }
             throw new Error("AI Service Unavailable: " + retryError.message);
        }
    }
}
