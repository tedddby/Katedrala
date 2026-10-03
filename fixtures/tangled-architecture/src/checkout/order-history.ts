import type { Customer } from "../customers/customer";
import { table } from "../lib/db";
import type { Order } from "./order";

const orders = table<Order>("orders");

export function recordOrder(order: Order): Order {
  return orders.upsert(order);
}

export function findOrder(orderId: string): Order | undefined {
  return orders.get(orderId);
}

export function recentOrders(customerId: Customer["id"], since: Date): Order[] {
  return orders
    .where((order) => order.customerId === customerId && order.placedAt >= since)
    .sort((a, b) => b.placedAt.getTime() - a.placedAt.getTime());
}

export function productsBoughtWith(productId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const order of orders.where((candidate) => candidate.lines.some((line) => line.productId === productId))) {
    for (const line of order.lines) {
      if (line.productId !== productId) {
        counts.set(line.productId, (counts.get(line.productId) ?? 0) + line.quantity);
      }
    }
  }
  return counts;
}
