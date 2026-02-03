import mongoose from "mongoose";
import { config } from "./env";
import { logger } from "../utils/logger";

export const connectDB = async () => {
    try {
        const conn = await mongoose.connect(config.MONGO_URI);
        logger.info(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error: any) {
        logger.error(`Error: ${error.message}`);
        process.exit(1);
    }
};
