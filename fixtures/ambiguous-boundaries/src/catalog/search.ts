import { availabilityOf } from "../checkout/stock-availability";
import { normalize } from "../common/slug";
import { descendantsOf } from "./category-tree";
import { isPurchasable, type Product } from "./product";
import { listProducts } from "./product-repository";

export interface SearchOptions {
  category?: string;
  inStockOnly?: boolean;
  limit?: number;
}

export function searchProducts(query: string, options: SearchOptions = {}): Product[] {
  const terms = normalize(query)
    .split(" ")
    .filter((term) => term !== "");
  const categories = options.category === undefined ? undefined : new Set(descendantsOf(options.category));
  return listProducts()
    .filter((product) => isPurchasable(product))
    .filter((product) => categories === undefined || categories.has(product.category))
    .filter((product) => !options.inStockOnly || availabilityOf(product) !== "sold-out")
    .filter((product) => {
      const haystack = normalize(`${product.name} ${product.description}`);
      return terms.every((term) => haystack.includes(term));
    })
    .slice(0, options.limit ?? 20);
}
