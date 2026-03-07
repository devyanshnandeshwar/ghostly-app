import dotenv from "dotenv";
import fs from "fs";
import path from "path";

// Load .env file
const envPath = path.resolve(__dirname, "../../.env");
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
} else {
    dotenv.config();
}

const defaultClientUrl = "http://localhost:5173";
const clientUrl = process.env.CLIENT_URL || defaultClientUrl;

// Allow production URL + localhost so both EC2 and local Docker/dev work
export const config = {
    PORT: process.env.PORT || 5000,
    MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/ghostly",
    CLIENT_URL: clientUrl,
    CORS_ORIGINS: [clientUrl, "http://localhost:3000", "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:5173"].filter(
        (origin, i, arr) => arr.indexOf(origin) === i
    ),
    NODE_ENV: process.env.NODE_ENV || "development",
    SESSION_SECRET: process.env.SESSION_SECRET || "supersecret"
};

// Validate essential env vars
const requiredVars = ["MONGO_URI"];
const missingVars = requiredVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
    console.warn(`[Config] ⚠️  Missing required environment variables: ${missingVars.join(", ")}`);
}
