const stock = new Map<string, number>([
  ["BEAN-ETH-250", 42],
  ["BEAN-COL-1000", 3],
  ["BEAN-ESP-1000", 120],
  ["GRIND-HAND-01", 0],
  ["KETTLE-GN-06", 7],
  ["FILTER-V60-100", 300],
]);

export function stockLevel(sku: string): number {
  return stock.get(sku) ?? 0;
}

export function adjustStock(sku: string, delta: number): number {
  const next = Math.max(0, stockLevel(sku) + delta);
  stock.set(sku, next);
  return next;
}

export function lowStockSkus(threshold = 5): string[] {
  return [...stock]
    .filter(([, level]) => level <= threshold)
    .map(([sku]) => sku)
    .sort();
}
