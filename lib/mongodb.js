import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB || "Project0";

if (!uri) {
    throw new Error(
        "Please define the MONGODB_URI environment variable inside .env.local"
    );
}

/**
 * Module-level cached client & db to reuse across lambda invocations / hot reload.
 * We'll ping the DB before returning cached client to detect stale connections.
 */
let cachedClient = null;
let cachedDb = null;

async function isClientAlive(db) {
    try {
        // ping the server to ensure connection is alive
        await db.command({ ping: 1 });
        return true;
    } catch (err) {
        return false;
    }
}

export async function connectToDatabase() {
    // If cached client + db exist, verify it's alive
    if (cachedClient && cachedDb) {
        try {
            const alive = await isClientAlive(cachedDb);
            if (alive) {
                return { client: cachedClient, db: cachedDb };
            } else {
                // stale client: attempt graceful close and reset cache
                try {
                    await cachedClient.close();
                } catch (_) {
                    // ignore close errors
                }
                cachedClient = null;
                cachedDb = null;
            }
        } catch (e) {
            // in case ping check itself throws, reset cache and reconnect
            try {
                await cachedClient?.close();
            } catch (_) { }
            cachedClient = null;
            cachedDb = null;
        }
    }

    // Create new client and connect
    const client = new MongoClient(uri, {
        maxPoolSize: 10,
        w: "majority",
        // useUnifiedTopology is default in modern drivers; left out for clarity
    });

    await client.connect(); // will throw if it can't connect
    const db = client.db(DB_NAME);

    // cache for reuse
    cachedClient = client;
    cachedDb = db;

    return { client, db };
}

export default connectToDatabase;
