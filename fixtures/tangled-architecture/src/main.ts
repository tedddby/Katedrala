import "./inventory/subscribers";
import { buildCartReminders } from "./cart/abandonment";
import { addItem, checkout, openCart } from "./cart/cart-service";
import { saveProduct, searchProducts } from "./catalog";
import { completeCheckout } from "./checkout/checkout-service";
import { renderReceipt } from "./checkout/receipts";
import { getCustomer, registerCustomer } from "./customers/customer-service";
import { adjustStock } from "./inventory/stock-service";

const HOUR_MS = 3_600_000;

async function main(): Promise<void> {
  saveProduct({ id: "p-100", sku: "KB-SPLIT-01", name: "Split keyboard", category: "keyboards", priceCents: 18_900 });
  saveProduct({ id: "p-200", sku: "MS-VERT-02", name: "Vertical mouse", category: "mice", priceCents: 5_900 });
  adjustStock("p-100", "wh-ber", 12);
  adjustStock("p-200", "wh-ber", 40);

  const customer = registerCustomer({
    id: "c-1",
    email: "grace@example.com",
    name: "Grace Hopper",
    shippingAddress: { line1: "Unter den Linden 1", city: "Berlin", postalCode: "10117", country: "DE" },
  });

  const cart = openCart(customer.id);
  for (const product of searchProducts("keyboards", { inStockOnly: true })) {
    addItem(cart.id, product.id);
  }
  addItem(cart.id, "p-200", 2);

  const order = await completeCheckout(checkout(cart.id));
  console.log(renderReceipt(order, getCustomer(customer.id)));

  setInterval(() => {
    for (const reminder of buildCartReminders(new Date(Date.now() - 24 * HOUR_MS))) {
      console.log(`[cart reminder] ${reminder.to}: ${reminder.subject}`);
    }
  }, HOUR_MS).unref();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
