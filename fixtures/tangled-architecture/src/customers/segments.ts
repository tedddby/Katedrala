import { findCart } from "../cart/cart-repository";
import { abandonedCarts } from "../cart/cart-stats";
import type { Customer } from "./customer";

export type Segment = "new" | "loyal" | "at-risk" | "cart-abandoner";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export function cartAbandoners(olderThanHours = 24, now = new Date()): Set<string> {
  const cutoff = new Date(now.getTime() - olderThanHours * HOUR_MS);
  const customerIds = abandonedCarts(cutoff)
    .map((cartId) => findCart(cartId)?.customerId)
    .filter((id): id is string => typeof id === "string");
  return new Set(customerIds);
}

export function segmentOf(customer: Customer, abandoners: ReadonlySet<string>, now = new Date()): Segment {
  if (abandoners.has(customer.id)) {
    return "cart-abandoner";
  }
  if (customer.lastOrder === undefined) {
    return "new";
  }
  const daysSinceLastOrder = (now.getTime() - customer.lastOrder.placedAt.getTime()) / DAY_MS;
  return daysSinceLastOrder > 180 ? "at-risk" : "loyal";
}
