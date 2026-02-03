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

export const config = {
    PORT: process.env.PORT || 5000,
    MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/ghostly",
    REDIS_URI: process.env.REDIS_URI || "redis://localhost:6379",
    CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",
    NODE_ENV: process.env.NODE_ENV || "development",
    SESSION_SECRET: process.env.SESSION_SECRET || "supersecret"
};

// Validate essential env vars
const requiredVars = ["MONGO_URI"];
const missingVars = requiredVars.filter((key) => !process.env[key]);

if (missingVars.length > 0) {
    console.warn(`[Config] ⚠️  Missing required environment variables: ${missingVars.join(", ")}`);
}
