import { availabilityLabel, availabilityOf } from "../checkout/stock-availability";
import { formatMoney } from "../common/format";
import { stockLevel } from "./inventory";
import { grossPriceCents } from "./price-calculator";
import { isPurchasable, type Product } from "./product";

export interface ProductCard {
  sku: string;
  title: string;
  price: string;
  availability: string;
  lowStockHint?: string;
  canAddToCart: boolean;
}

export function toProductCard(product: Product, country = "DE"): ProductCard {
  const level = stockLevel(product.sku);
  const availability = availabilityOf(product);
  return {
    sku: product.sku,
    title: product.name,
    price: formatMoney(grossPriceCents(product.netPriceCents, country, product.taxCategory)),
    availability: availabilityLabel(availability),
    lowStockHint: level > 0 && level <= 5 ? `Only ${level} left` : undefined,
    canAddToCart: isPurchasable(product) && availability !== "sold-out",
  };
}
