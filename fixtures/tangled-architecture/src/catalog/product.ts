import type { StockLevel } from "../inventory/stock-level";
import type { Cents } from "../lib/money";

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  priceCents: Cents;
  stock?: StockLevel[];
}

export function isDiscontinued(product: Product): boolean {
  return product.sku.startsWith("EOL-");
}
