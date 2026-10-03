import { getProduct } from "../catalog/product-service";
import type { Customer } from "../customers/customer";
import { pointsFor } from "../customers/loyalty";
import { formatCents } from "../lib/money";
import type { Order } from "./order";

export function renderReceipt(order: Order, customer: Customer): string {
  const lines = order.lines.map((line) => {
    const sku = getProduct(line.productId)?.sku ?? "n/a";
    return `${String(line.quantity).padStart(3)} x ${line.name} [${sku}]  ${formatCents(line.unitPriceCents * line.quantity)}`;
  });
  return [
    `Receipt for order ${order.id}`,
    `${customer.name} <${customer.email}>`,
    "",
    ...lines,
    "",
    `Total: ${formatCents(order.totalCents)}`,
    `Loyalty points earned: ${pointsFor(order.totalCents, customer.tier)}`,
  ].join("\n");
}
