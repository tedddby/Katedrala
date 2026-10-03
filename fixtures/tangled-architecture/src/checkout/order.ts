import type { Cart } from "../cart/cart";
import type { Customer } from "../customers/customer";
import type { Cents } from "../lib/money";

export type OrderStatus = "pending-payment" | "paid" | "refunded" | "cancelled";

export interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  unitPriceCents: Cents;
}

export interface Order {
  id: string;
  customerId: Customer["id"];
  lines: OrderLine[];
  totalCents: Cents;
  status: OrderStatus;
  placedAt: Date;
}

export function linesFromCart(cart: Cart): OrderLine[] {
  return cart.items.map((item) => ({
    productId: item.product.id,
    name: item.product.name,
    quantity: item.quantity,
    unitPriceCents: item.unitPriceCents,
  }));
}
