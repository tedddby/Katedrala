import { allCarts } from "./cart-repository";

export function popularProducts(limit: number): string[] {
  const counts = new Map<string, number>();
  for (const cart of allCarts()) {
    for (const item of cart.items) {
      counts.set(item.product.id, (counts.get(item.product.id) ?? 0) + item.quantity);
    }
  }
  return [...counts]
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([id]) => id);
}

export function abandonedCarts(olderThan: Date): string[] {
  return allCarts()
    .filter((cart) => cart.items.length > 0 && cart.updatedAt < olderThan)
    .map((cart) => cart.id);
}
