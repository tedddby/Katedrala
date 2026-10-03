export type ProductId = string;

export interface Product {
  sku: ProductId;
  name: string;
  description: string;
  category: string;
  netPriceCents: number;
  taxCategory: "standard" | "reduced";
  weightGrams: number;
  active: boolean;
  releasedAt: string;
}

export function isPurchasable(product: Product, now: Date = new Date()): boolean {
  return product.active && new Date(product.releasedAt).getTime() <= now.getTime();
}
