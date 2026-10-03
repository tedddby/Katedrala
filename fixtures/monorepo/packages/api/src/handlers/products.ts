import type { Catalog, Product } from "@acme/core";
import { truncate } from "@acme/shared/strings";
import { groupBy, sortBy } from "lodash";

export interface ProductListItem {
  id: string;
  slug: string;
  name: string;
  summary: string;
  price: Product["price"];
  inStock: boolean;
}

export function listProducts(catalog: Catalog, query: URLSearchParams): Record<string, ProductListItem[]> {
  const sortKey = query.get("sort") === "price" ? "price.amountCents" : "name";
  const items: ProductListItem[] = sortBy(catalog.list(), [sortKey]).map((product: Product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    summary: truncate(product.description, 60),
    price: product.price,
    inStock: product.stock > 0,
  }));
  return groupBy(items, (item: ProductListItem) => (item.inStock ? "available" : "soldOut"));
}
