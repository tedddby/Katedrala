import { estimateShipping } from "../cart/shipping-estimator";
import { orderTotals, type PricedLine } from "../catalog/price-calculator";
import { formatMoney } from "../common/format";
import { isDomestic, type Address } from "./address";
import { describeCoupon, findCoupon } from "./discounts";
import { zoneFor, zoneLabel } from "./shipping-rates";
import { isTaxExempt } from "./tax-rules";

export interface OrderSummary {
  lines: Array<{ sku: string; quantity: number; total: string }>;
  subtotal: string;
  discount?: string;
  shipping: string;
  vat: string;
  total: string;
  destination: string;
  notes: string[];
  totalCents: number;
}

export function summarizeOrder(
  lines: readonly PricedLine[],
  address: Address,
  weightGrams: number,
  couponCode?: string,
): OrderSummary {
  const coupon = couponCode === undefined ? undefined : findCoupon(couponCode);
  const totals = orderTotals(lines, address.country, coupon);
  const shipping = estimateShipping(address, weightGrams, totals.netCents - totals.discountCents);
  const totalCents = totals.grossCents + shipping.costCents;

  const notes: string[] = [];
  if (isTaxExempt(address.country)) {
    notes.push("Export delivery: no VAT is charged, import duties may apply.");
  }
  if (!isDomestic(address)) {
    notes.push(`Ships to ${zoneLabel(zoneFor(address))} in ${shipping.days} days.`);
  }
  if (couponCode !== undefined && coupon === undefined) {
    notes.push(`Coupon ${couponCode} is not valid.`);
  }

  return {
    lines: lines.map((line) => ({
      sku: line.sku,
      quantity: line.quantity,
      total: formatMoney(line.netUnitCents * line.quantity),
    })),
    subtotal: formatMoney(totals.netCents),
    discount: coupon === undefined ? undefined : `${describeCoupon(coupon)} (-${formatMoney(totals.discountCents)})`,
    shipping: shipping.costCents === 0 ? "free" : formatMoney(shipping.costCents),
    vat: formatMoney(totals.vatCents),
    total: formatMoney(totalCents),
    destination: zoneLabel(shipping.zone),
    notes,
    totalCents,
  };
}
