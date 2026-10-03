import { lineTotal, type OrderLine } from "./order-line";
import type { UserId } from "./user";

export type OrderStatus = "draft" | "placed" | "paid" | "shipped" | "cancelled";

export interface Order {
  id: string;
  customerId: UserId;
  lines: OrderLine[];
  currency: string;
  status: OrderStatus;
  placedAt: Date | null;
}

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  draft: ["placed", "cancelled"],
  placed: ["paid", "cancelled"],
  paid: ["shipped"],
  shipped: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function orderTotal(order: Pick<Order, "lines">): number {
  return order.lines.reduce((sum, line) => sum + lineTotal(line), 0);
}
