import type { OrderLine, Totals } from "../types.js";

/** VAT rates by destination country; shipments elsewhere are zero-rated exports. */
const VAT_RATES: Readonly<Record<string, number>> = { AT: 0.2, DE: 0.19, FR: 0.2, NL: 0.21 };

export function subtotal(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0);
}

export function totalWeight(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.weightGrams, 0);
}

export function calculateTotals(lines: readonly OrderLine[], shippingCents: number, country: string): Totals {
  const subtotalCents = subtotal(lines);
  const taxCents = Math.round((subtotalCents + shippingCents) * (VAT_RATES[country] ?? 0));
  return { subtotalCents, shippingCents, taxCents, totalCents: subtotalCents + shippingCents + taxCents };
}
