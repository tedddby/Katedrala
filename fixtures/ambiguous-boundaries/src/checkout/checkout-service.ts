import { orderTotals, type PricedLine } from "../catalog/price-calculator";
import { isValidEmail, isValidPostalCode } from "../common/validation";
import { normalizeAddress, type Address } from "./address";
import { deliveryOptions } from "./delivery";
import { findCoupon } from "./discounts";
import { buildInvoice, type Invoice } from "./invoice";
import { summarizeOrder, type OrderSummary } from "./order-summary";
import { authorizePayment } from "./payment";

/** What checkout needs from a cart; the cart feature's `Cart` satisfies it structurally. */
export interface CheckoutCart {
  sessionId: string;
  items: ReadonlyArray<{
    sku: string;
    quantity: number;
    netUnitCents: number;
    taxCategory: "standard" | "reduced";
    weightGrams: number;
  }>;
}

export interface CheckoutRequest {
  cart: CheckoutCart;
  email: string;
  address: Address;
  couponCode?: string;
  deliveryOption: "standard" | "express";
  cardToken: string;
}

export interface CheckoutResult {
  orderId: string;
  invoice: Invoice;
  summary: OrderSummary;
}

export class CheckoutError extends Error {}

function toPricedLines(cart: CheckoutCart): PricedLine[] {
  return cart.items.map((item) => ({
    sku: item.sku,
    quantity: item.quantity,
    netUnitCents: item.netUnitCents,
    taxCategory: item.taxCategory,
  }));
}

export async function checkout(request: CheckoutRequest): Promise<CheckoutResult> {
  if (!isValidEmail(request.email)) {
    throw new CheckoutError(`Invalid e-mail address: ${request.email}`);
  }
  if (request.cart.items.length === 0) {
    throw new CheckoutError("The cart is empty");
  }
  const address = normalizeAddress(request.address);
  if (!isValidPostalCode(address.postalCode, address.country)) {
    throw new CheckoutError(`Invalid postal code ${address.postalCode} for ${address.country}`);
  }

  const lines = toPricedLines(request.cart);
  const weightGrams = request.cart.items.reduce((sum, item) => sum + item.weightGrams * item.quantity, 0);
  const coupon = request.couponCode === undefined ? undefined : findCoupon(request.couponCode);
  // Totals are recomputed here rather than taken from the summary shown to the customer.
  const totals = orderTotals(lines, address.country, coupon);
  const delivery = deliveryOptions(address, weightGrams, totals.netCents - totals.discountCents).find(
    (option) => option.id === request.deliveryOption,
  );
  if (delivery === undefined) {
    throw new CheckoutError(`Delivery option ${request.deliveryOption} is not available for ${address.country}`);
  }

  const orderId = `ORD-${request.cart.sessionId.slice(0, 8)}-${Date.now().toString(36)}`;
  const payment = await authorizePayment(orderId, totals.grossCents + delivery.costCents, request.cardToken);
  if (payment.status !== "authorized") {
    throw new CheckoutError("The payment was declined");
  }

  return {
    orderId,
    invoice: buildInvoice(orderId, lines, address, delivery.costCents, coupon),
    summary: summarizeOrder(lines, address, weightGrams, request.couponCode),
  };
}
