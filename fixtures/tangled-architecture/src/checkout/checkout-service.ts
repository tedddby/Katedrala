import { cartTotal, type Cart } from "../cart/cart";
import { clearCart } from "../cart/cart-service";
import { getCustomer } from "../customers/customer-service";
import { releaseReservations, reserveForOrder } from "../inventory/reservations";
import { nextId } from "../lib/db";
import { publish } from "../lib/events";
import { linesFromCart, type Order } from "./order";
import { recordOrder } from "./order-history";
import { chargeCustomer } from "./payment";

export interface CheckoutSession {
  cartId: string;
  order: Order;
}

export function beginCheckout(cart: Cart): CheckoutSession {
  if (cart.customerId === null) {
    throw new Error("Guest checkout is not supported yet; sign in first");
  }
  const customer = getCustomer(cart.customerId);
  const order = recordOrder({
    id: nextId("order"),
    customerId: customer.id,
    lines: linesFromCart(cart),
    totalCents: cartTotal(cart),
    status: "pending-payment",
    placedAt: new Date(),
  });
  reserveForOrder(order);
  return { cartId: cart.id, order };
}

export async function completeCheckout(session: CheckoutSession): Promise<Order> {
  const customer = getCustomer(session.order.customerId);
  const charged = await chargeCustomer(customer, session.order.totalCents);
  if (!charged) {
    releaseReservations(session.order);
    return recordOrder({ ...session.order, status: "cancelled" });
  }

  const paid = recordOrder({ ...session.order, status: "paid" });
  clearCart(session.cartId);
  publish("order.placed", {
    orderId: paid.id,
    customerId: paid.customerId,
    lines: paid.lines.map(({ productId, quantity }) => ({ productId, quantity })),
  });
  return paid;
}
