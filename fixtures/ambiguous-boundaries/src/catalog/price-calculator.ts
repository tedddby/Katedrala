import { applyCoupon, type Coupon } from "../checkout/discounts";
import { vatRate, type TaxCategory } from "../checkout/tax-rules";

export interface PricedLine {
  sku: string;
  quantity: number;
  netUnitCents: number;
  taxCategory: TaxCategory;
}

export interface OrderTotals {
  netCents: number;
  discountCents: number;
  vatCents: number;
  grossCents: number;
}

export function grossPriceCents(netCents: number, country: string, category: TaxCategory = "standard"): number {
  return Math.round(netCents * (1 + vatRate(country, category)));
}

export function orderTotals(lines: readonly PricedLine[], country: string, coupon?: Coupon): OrderTotals {
  const netCents = lines.reduce((sum, line) => sum + line.netUnitCents * line.quantity, 0);
  const discountCents = applyCoupon(netCents, coupon);
  const discountRatio = netCents === 0 ? 0 : (netCents - discountCents) / netCents;
  const vatCents = lines.reduce(
    (sum, line) =>
      sum + Math.round(line.netUnitCents * line.quantity * discountRatio * vatRate(country, line.taxCategory)),
    0,
  );
  return { netCents, discountCents, vatCents, grossCents: netCents - discountCents + vatCents };
}
