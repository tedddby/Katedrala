export type OrderStatus = "pending" | "paid" | "failed" | "cancelled";

export interface OrderItem {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  userId: string;
  status: OrderStatus;
  items: OrderItem[];
  totalCents: number;
  currency: string;
  chargeId: string | null;
  createdAt: Date;
}

export type NewOrder = Omit<Order, "id" | "createdAt">;

export interface CreateOrderInput {
  items: OrderItem[];
  currency: string;
  /** Stripe card token or source id, e.g. `tok_visa`. */
  paymentSource: string;
}

export function orderTotal(items: readonly OrderItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}
