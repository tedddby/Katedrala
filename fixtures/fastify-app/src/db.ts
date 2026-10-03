import { MongoClient, type Collection } from "mongodb";
import { config } from "./config.js";
import type { OrderDocument } from "./types.js";

const client = new MongoClient(config.mongoUrl, { maxPoolSize: 20, appName: "fulfillment-api" });
let connection: Promise<MongoClient> | undefined;

function connect(): Promise<MongoClient> {
  connection ??= client.connect();
  return connection;
}

export async function ordersCollection(): Promise<Collection<OrderDocument>> {
  const connected = await connect();
  return connected.db(config.mongoDatabase).collection<OrderDocument>("orders");
}

export async function pingDatabase(): Promise<boolean> {
  try {
    const connected = await connect();
    await connected.db(config.mongoDatabase).command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export async function closeDatabase(): Promise<void> {
  await client.close();
  connection = undefined;
}
