export type OrderStatus = "pending" | "paid" | "refunded" | "cancelled";

export interface OrderLine {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  customerId: string;
  lines: OrderLine[];
  status: OrderStatus;
  paymentId?: string;
  createdAt: Date;
}

export function orderTotalCents(order: Pick<Order, "lines">): number {
  return order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
}

export function assertValidLines(lines: OrderLine[]): void {
  if (lines.length === 0) {
    throw new Error("An order needs at least one line");
  }
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error(`Invalid quantity ${line.quantity} for ${line.sku}`);
    }
  }
}
