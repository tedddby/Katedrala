import { ObjectId, type Filter } from "mongodb";
import { ordersCollection } from "../db.js";
import type { Order, OrderDocument, OrderStatus } from "../types.js";

function toOrder({ _id, ...rest }: OrderDocument): Order {
  return { id: _id.toHexString(), ...rest };
}

export async function findOrders(filter: { customerId?: string }, limit = 50): Promise<Order[]> {
  const query: Filter<OrderDocument> = filter.customerId === undefined ? {} : { customerId: filter.customerId };
  const collection = await ordersCollection();
  const documents = await collection.find(query).sort({ createdAt: -1 }).limit(limit).toArray();
  return documents.map(toOrder);
}

export async function findOrderById(id: string): Promise<Order | null> {
  if (!ObjectId.isValid(id)) {
    return null;
  }
  const collection = await ordersCollection();
  const document = await collection.findOne({ _id: new ObjectId(id) });
  return document === null ? null : toOrder(document);
}

export async function insertOrder(order: Omit<OrderDocument, "_id">): Promise<Order> {
  const collection = await ordersCollection();
  const document: OrderDocument = { _id: new ObjectId(), ...order };
  await collection.insertOne(document);
  return toOrder(document);
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
  const collection = await ordersCollection();
  const document = await collection.findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return document === null ? null : toOrder(document);
}
