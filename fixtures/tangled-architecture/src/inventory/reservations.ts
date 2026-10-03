import type { Order } from "../checkout/order";
import { table } from "../lib/db";
import { available } from "./stock-level";
import { stockFor } from "./stock-service";

export interface Reservation {
  id: string;
  orderId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
}

const reservations = table<Reservation>("reservations");

export class InsufficientStockError extends Error {}

export function reserveForOrder(order: Order): Reservation[] {
  return order.lines.map((line) => {
    const level = stockFor(line.productId).find((candidate) => available(candidate) >= line.quantity);
    if (level === undefined) {
      throw new InsufficientStockError(`Not enough stock for ${line.name}`);
    }
    level.reserved += line.quantity;
    return reservations.upsert({
      id: `${order.id}:${line.productId}`,
      orderId: order.id,
      productId: line.productId,
      warehouseId: level.warehouseId,
      quantity: line.quantity,
    });
  });
}

function release(orderId: string): Reservation[] {
  const released = reservations.where((candidate) => candidate.orderId === orderId);
  for (const reservation of released) {
    const level = stockFor(reservation.productId).find((candidate) => candidate.warehouseId === reservation.warehouseId);
    if (level !== undefined) {
      level.reserved = Math.max(0, level.reserved - reservation.quantity);
    }
    reservations.delete(reservation.id);
  }
  return released;
}

/** The order was not paid: the stock becomes available again. */
export function releaseReservations(order: Order): void {
  release(order.id);
}

/** The order was paid: returns the stock movements the caller must book. */
export function commitReservations(orderId: string): Reservation[] {
  return release(orderId);
}
