import type { Product } from "../catalog/product";
import type { Cents } from "../lib/money";

export interface CartItem {
  product: Product;
  quantity: number;
  unitPriceCents: Cents;
}

export interface Cart {
  id: string;
  customerId: string | null;
  items: CartItem[];
  updatedAt: Date;
}

export function cartTotal(cart: Cart): Cents {
  return cart.items.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
}

export function itemCount(cart: Cart): number {
  return cart.items.reduce((count, item) => count + item.quantity, 0);
}
