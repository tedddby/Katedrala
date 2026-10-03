import { popularProducts } from "../cart/cart-stats";
import { productsBoughtWith } from "../checkout/order-history";
import type { Product } from "./product";
import { getProduct } from "./product-service";

function existing(ids: string[]): Product[] {
  return ids.map((id) => getProduct(id)).filter((product): product is Product => product !== undefined);
}

export function frequentlyBoughtWith(productId: string, limit = 4): Product[] {
  const ranked = [...productsBoughtWith(productId)].sort(([, a], [, b]) => b - a).map(([id]) => id);
  return existing(ranked).slice(0, limit);
}

export function trending(limit = 8): Product[] {
  return existing(popularProducts(limit));
}
