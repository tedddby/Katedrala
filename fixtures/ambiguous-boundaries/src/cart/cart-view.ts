import { formatMoney } from "../common/format";
import { itemCount, merchandiseNetCents, type Cart } from "./cart";
import { MAX_ITEMS, violations } from "./cart-rules";

export interface CartView {
  count: number;
  capacity: string;
  lines: Array<{ sku: string; name: string; quantity: number; total: string }>;
  subtotal: string;
  warnings: string[];
}

export function toCartView(cart: Cart): CartView {
  return {
    count: itemCount(cart),
    capacity: `${itemCount(cart)} / ${MAX_ITEMS}`,
    lines: cart.items.map((item) => ({
      sku: item.sku,
      name: item.name,
      quantity: item.quantity,
      total: formatMoney(item.netUnitCents * item.quantity),
    })),
    subtotal: formatMoney(merchandiseNetCents(cart)),
    warnings: violations(cart),
  };
}
