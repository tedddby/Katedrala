import { orderTotals, type PricedLine } from "../catalog/price-calculator";
import { formatDate, formatMoney } from "../common/format";
import { formatAddress, type Address } from "./address";
import { describeCoupon, type Coupon } from "./discounts";
import { vatRate } from "./tax-rules";

export interface Invoice {
  number: string;
  issuedAt: string;
  text: string;
  grossCents: number;
}

let sequence = 1000;

export function buildInvoice(
  orderId: string,
  lines: readonly PricedLine[],
  billingAddress: Address,
  shippingCents: number,
  coupon?: Coupon,
  issuedAt: Date = new Date(),
): Invoice {
  const totals = orderTotals(lines, billingAddress.country, coupon);
  sequence += 1;
  const number = `INV-${issuedAt.getFullYear()}-${String(sequence).padStart(6, "0")}`;
  const grossCents = totals.grossCents + shippingCents;
  const body = lines.map((line) => {
    const rate = vatRate(billingAddress.country, line.taxCategory) * 100;
    return `${line.quantity} x ${line.sku}  ${formatMoney(line.netUnitCents * line.quantity)}  (VAT ${rate.toFixed(1)}%)`;
  });
  const text = [
    `Invoice ${number} for order ${orderId}, ${formatDate(issuedAt)}`,
    ...formatAddress(billingAddress),
    "",
    ...body,
    coupon === undefined ? "" : `Discount ${describeCoupon(coupon)}: -${formatMoney(totals.discountCents)}`,
    `Shipping: ${formatMoney(shippingCents)}`,
    `VAT: ${formatMoney(totals.vatCents)}`,
    `Total: ${formatMoney(grossCents)}`,
  ].join("\n");
  return { number, issuedAt: issuedAt.toISOString(), text, grossCents };
}
