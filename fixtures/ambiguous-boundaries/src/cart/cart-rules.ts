import { itemCount, type Cart, type CartItem } from "./cart";

export const MAX_ITEMS = 50;
export const MAX_QUANTITY_PER_SKU = 10;

export function canAdd(cart: Cart, item: CartItem): boolean {
  const current = cart.items.find((candidate) => candidate.sku === item.sku)?.quantity ?? 0;
  return current + item.quantity <= MAX_QUANTITY_PER_SKU && itemCount(cart) + item.quantity <= MAX_ITEMS;
}

export function violations(cart: Cart): string[] {
  const problems: string[] = [];
  if (itemCount(cart) > MAX_ITEMS) {
    problems.push(`A cart can hold at most ${MAX_ITEMS} items.`);
  }
  for (const item of cart.items) {
    if (item.quantity > MAX_QUANTITY_PER_SKU) {
      problems.push(`At most ${MAX_QUANTITY_PER_SKU} x ${item.name} per order.`);
    }
  }
  return problems;
}
