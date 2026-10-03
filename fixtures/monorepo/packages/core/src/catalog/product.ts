import { money, slugify, type Money } from "@acme/shared";

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: Money;
  stock: number;
}

export function createProduct(id: string, name: string, description: string, priceCents: number, stock = 0): Product {
  return { id, slug: slugify(name), name, description, price: money(priceCents), stock };
}

export function isInStock(product: Product, quantity = 1): boolean {
  return product.stock >= quantity;
}
