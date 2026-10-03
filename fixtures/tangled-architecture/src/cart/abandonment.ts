import { displayPrice } from "../catalog/pricing";
import { getCustomer } from "../customers/customer-service";
import { itemCount } from "./cart";
import { findCart } from "./cart-repository";
import { abandonedCarts } from "./cart-stats";

export interface CartReminder {
  to: string;
  subject: string;
  body: string;
}

export function buildCartReminders(olderThan: Date): CartReminder[] {
  const reminders: CartReminder[] = [];
  for (const cartId of abandonedCarts(olderThan)) {
    const cart = findCart(cartId);
    if (cart === undefined || cart.customerId === null) {
      continue;
    }
    const customer = getCustomer(cart.customerId);
    const lines = cart.items.map(
      (item) => `- ${item.quantity} x ${item.product.name} at ${displayPrice(item.product, customer.tier)}`,
    );
    reminders.push({
      to: customer.email,
      subject: `You left ${itemCount(cart)} item(s) in your cart`,
      body: [`Hi ${customer.name},`, "", "your cart is waiting for you:", ...lines].join("\n"),
    });
  }
  return reminders;
}
