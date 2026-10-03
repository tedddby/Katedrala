import { quoteShipping } from "../clients/shipping.client.js";
import { OrderNotFoundError, OrderStateError } from "../errors.js";
import * as repository from "../repositories/orders.repository.js";
import type { CreateOrderBody } from "../schemas/order.schema.js";
import type { Order } from "../types.js";
import { calculateTotals, totalWeight } from "./pricing.js";

export function listOrders(customerId?: string): Promise<Order[]> {
  return repository.findOrders(customerId === undefined ? {} : { customerId });
}

export async function getOrder(id: string): Promise<Order> {
  const order = await repository.findOrderById(id);
  if (order === null) {
    throw new OrderNotFoundError(id);
  }
  return order;
}

export async function placeOrder(input: CreateOrderBody): Promise<Order> {
  const quote = await quoteShipping(input.shippingCountry, totalWeight(input.lines));
  const now = new Date();
  return repository.insertOrder({
    customerId: input.customerId,
    status: "pending",
    lines: input.lines,
    shippingCountry: input.shippingCountry,
    carrier: quote.carrier,
    totals: calculateTotals(input.lines, quote.amountCents, input.shippingCountry),
    createdAt: now,
    updatedAt: now,
  });
}

export async function cancelOrder(id: string): Promise<Order> {
  const order = await getOrder(id);
  if (order.status === "cancelled") {
    return order;
  }
  if (order.status !== "pending") {
    throw new OrderStateError(`Order ${id} is ${order.status} and can no longer be cancelled`);
  }
  const updated = await repository.updateOrderStatus(id, "cancelled");
  if (updated === null) {
    throw new OrderNotFoundError(id);
  }
  return updated;
}
