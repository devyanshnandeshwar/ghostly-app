import mongoose from "mongoose";
import dotenv from "dotenv";
import { UserSession } from "../models/UserSession";

dotenv.config();

async function checkIndexes() {
    try {
        console.log("Connecting to MongoDB...");
        await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/ghostly");
        
        console.log("Fetching indexes for UserSession...");
        const indexes = await UserSession.collection.indexes();
        
        console.log("\n--- Active Indexes ---");
        let ttlFound = false;

        indexes.forEach(idx => {
            console.log(`Name: ${idx.name}`);
            console.log(`Keys: ${JSON.stringify(idx.key)}`);
            if (idx.expireAfterSeconds) {
                console.log(`TTL (expireAfterSeconds): ${idx.expireAfterSeconds}`);
                if (idx.expireAfterSeconds === 2592000) {
                    ttlFound = true;
                }
            }
            console.log("----------------------");
        });

        if (ttlFound) {
            console.log("\n✅ SUCCESS: 30-day TTL index found!");
        } else {
            console.log("\n❌ FAIL: 30-day TTL index NOT found.");
        }

    } catch (error) {
        console.error("Error checking indexes:", error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

checkIndexes();
