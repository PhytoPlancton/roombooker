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
    maxPoolSize: 20,
    minPoolSize: 2,
    socketTimeoutMS: 30_000,
    serverSelectionTimeoutMS: 10_000,
    waitQueueTimeoutMS: 5_000,
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
