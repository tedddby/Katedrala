import { nextId, table } from "../lib/db";
import type { Cart } from "./cart";

const carts = table<Cart>("carts");

export function findCart(id: string): Cart | undefined {
  return carts.get(id);
}

export function createCart(customerId: string | null): Cart {
  return carts.upsert({ id: nextId("cart"), customerId, items: [], updatedAt: new Date() });
}

export function saveCart(cart: Cart): Cart {
  return carts.upsert({ ...cart, updatedAt: new Date() });
}

export function deleteCart(id: string): void {
  carts.delete(id);
}

export function allCarts(): Cart[] {
  return carts.all();
}
