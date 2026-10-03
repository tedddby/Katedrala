import type { LoyaltyTier } from "../customers/customer";
import { discountFor } from "../customers/loyalty";
import { applyDiscount, formatCents, type Cents } from "../lib/money";
import type { Product } from "./product";

export function unitPrice(product: Product, tier?: LoyaltyTier): Cents {
  return tier === undefined ? product.priceCents : applyDiscount(product.priceCents, discountFor(tier));
}

export function displayPrice(product: Product, tier?: LoyaltyTier): string {
  const price = unitPrice(product, tier);
  return price < product.priceCents
    ? `${formatCents(price)} (was ${formatCents(product.priceCents)})`
    : formatCents(price);
}
