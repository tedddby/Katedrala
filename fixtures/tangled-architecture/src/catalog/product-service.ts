import { stockFor, totalAvailable } from "../inventory/stock-service";
import { table } from "../lib/db";
import { isDiscontinued, type Product } from "./product";

const products = table<Product>("products");

export function saveProduct(product: Product): Product {
  return products.upsert(product);
}

export function getProduct(id: string): Product | undefined {
  const product = products.get(id);
  return product === undefined ? undefined : { ...product, stock: stockFor(product.id) };
}

export function productName(id: string): string {
  return products.get(id)?.name ?? id;
}

export function searchProducts(query: string, options: { inStockOnly?: boolean } = {}): Product[] {
  const needle = query.trim().toLowerCase();
  return products
    .where((product) => !isDiscontinued(product))
    .filter((product) => product.category === needle || product.name.toLowerCase().includes(needle))
    .filter((product) => !options.inStockOnly || totalAvailable(product.id) > 0);
}
