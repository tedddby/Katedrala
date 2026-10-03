import { stockLevel } from "../catalog/inventory";
import type { Product } from "../catalog/product";

export type Availability = "in-stock" | "low-stock" | "sold-out";

const LOW_STOCK_THRESHOLD = 5;

export function availabilityOf(product: Product): Availability {
  const level = stockLevel(product.sku);
  if (level === 0 || !product.active) return "sold-out";
  return level <= LOW_STOCK_THRESHOLD ? "low-stock" : "in-stock";
}

export function availabilityLabel(availability: Availability): string {
  switch (availability) {
    case "in-stock":
      return "In stock";
    case "low-stock":
      return "Only a few left";
    case "sold-out":
      return "Sold out";
  }
}
