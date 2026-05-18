import { MongoClient, type Db } from "mongodb";

declare global {
  var __mongoClient: MongoClient | undefined;
  var __mongoDbPromise: Promise<Db> | undefined;
}

function makeClient(): MongoClient {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI missing — see .env.example");
  }
  return new MongoClient(uri, {
    // Right-sized for a 5-user app on a SHARED Atlas M0 cluster (500
    // connections cluster-wide, ~5 apps competing). With 20 we kept all
    // pool slots warm and starved the rest of the cluster — when neighbors
    // spiked, our waitQueue timed out and webhooks/cron silently lost
    // their DB writes (no audit, no booking). At 5 with a 30s idle expiry,
    // we hold ~1-3 connections in steady state and release them quickly.
    maxPoolSize: 5,
    minPoolSize: 0,
    maxIdleTimeMS: 30_000,
    socketTimeoutMS: 30_000,
    serverSelectionTimeoutMS: 10_000,
    waitQueueTimeoutMS: 10_000,
  });
}

export function getDb(): Promise<Db> {
  if (!global.__mongoDbPromise) {
    if (!global.__mongoClient) global.__mongoClient = makeClient();
    const dbName = process.env.MONGODB_DB || "roombooker";
    global.__mongoDbPromise = global.__mongoClient.connect().then((c) => c.db(dbName));
  }
  return global.__mongoDbPromise;
}
