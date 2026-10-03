import type { Money } from "@/utils/money";
import { addMoney, money } from "@/utils/money";

export enum OrderStatus {
  Pending = "pending",
  Paid = "paid",
  Shipped = "shipped",
  Cancelled = "cancelled",
}

export const enum Priority {
  Low,
  Normal,
  High,
}

export interface OrderLine {
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: Money;
}

export interface Order {
  readonly id: string;
  readonly customerId: string;
  readonly lines: readonly OrderLine[];
  status: OrderStatus;
}

/** Fields added by the fulfilment team (interface declaration merging). */
export interface Order {
  priority?: Priority;
  notes?: string;
}

export type OrderInput = Pick<Order, "customerId" | "lines"> & { readonly priority?: Priority };

export function lineTotal(line: OrderLine): Money {
  return money(line.unitPrice.amountCents * line.quantity, line.unitPrice.currency);
}

export function calculateTotal(lines: readonly OrderLine[]): Money {
  let total = money(0, lines[0]?.unitPrice.currency ?? "EUR");
  for (const line of lines) {
    total = addMoney(total, lineTotal(line));
  }
  return total;
}

export function isOpen(order: Pick<Order, "status">): boolean {
  return order.status === OrderStatus.Pending || order.status === OrderStatus.Paid;
}
