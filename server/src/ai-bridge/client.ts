import axios from "axios";
import FormData from "form-data";
import { logger } from "../utils/logger";

const AI_SERVICE_URL = "http://localhost:8000/api/verify-gender";

export async function verifyGender(imageBuffer: Buffer) {
    try {
        const form = new FormData();
        form.append("image", imageBuffer, { filename: "upload.jpg" });

        const response = await axios.post(AI_SERVICE_URL, form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 5000, // 5s timeout
        });


        return {
            gender: response.data.gender,
            confidence: response.data.confidence
        };
    } catch (error: any) {
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

            const responseRetry = await axios.post(AI_SERVICE_URL, formRetry, {
                headers: {
                    ...formRetry.getHeaders()
                },
                timeout: 5000,
            });

             return {
                gender: responseRetry.data.gender,
                confidence: responseRetry.data.confidence
            };

        } catch (retryError: any) {
             logger.error("[AI Bridge] Retry Failed:", retryError.message);
             if (retryError.response) {
                logger.error("[AI Bridge] Retry Response Data:", retryError.response.data);
            }
             throw new Error("AI Service Unavailable: " + retryError.message);
        }
    }
}
