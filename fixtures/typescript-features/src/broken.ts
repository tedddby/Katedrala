import { OrderStatus } from "./orders/order.js";
import { formatMoney } from "@/utils/money";

export function statusLabel(status: OrderStatus): string {
  return status === OrderStatus.Cancelled ? "cancelled" : `open (${status})`;
}

// Work in progress: the call below was left half-edited.
export function summarize(totalCents: number, status: OrderStatus): string {
  const label = statusLabel(status;
  return label + ": " + formatMoney(totalCents);
}
