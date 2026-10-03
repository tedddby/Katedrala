import { mergeCarts } from "../cart/cart-service";
import { table } from "../lib/db";
import { estimateDeliveryDays } from "./addresses";
import type { Customer } from "./customer";
import { tierFor } from "./loyalty";
import { cartAbandoners, segmentOf } from "./segments";

const customers = table<Customer>("customers");

export class CustomerNotFoundError extends Error {
  constructor(readonly customerId: string) {
    super(`Customer ${customerId} not found`);
  }
}

export function registerCustomer(input: Pick<Customer, "id" | "email" | "name" | "shippingAddress">): Customer {
  return customers.upsert({ ...input, email: input.email.trim().toLowerCase(), tier: "bronze" });
}

export function getCustomer(id: string): Customer {
  const customer = customers.get(id);
  if (customer === undefined) {
    throw new CustomerNotFoundError(id);
  }
  return { ...customer, tier: tierFor(id) };
}

/** Called after sign-in: keeps what the visitor put into the cart while anonymous. */
export function signIn(customerId: string, guestCartId: string | null, customerCartId: string): string {
  getCustomer(customerId);
  return guestCartId === null ? customerCartId : mergeCarts(guestCartId, customerCartId).id;
}

export async function customerOverview(id: string) {
  const customer = getCustomer(id);
  // Imported lazily to work around a circular import at startup (customers -> cart -> checkout -> customers).
  const { recentOrders } = await import("../checkout/order-history");
  const orders = recentOrders(id, new Date(0));
  return {
    customer,
    segment: segmentOf(customer, cartAbandoners()),
    orderCount: orders.length,
    lifetimeValueCents: orders.reduce((sum, order) => sum + order.totalCents, 0),
    deliveryDays: customer.shippingAddress === undefined ? null : estimateDeliveryDays(customer.shippingAddress),
  };
}
