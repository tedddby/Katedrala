import { groupBy, sumBy } from "src/utils/collections";
import { formatMoney } from "@/utils/money";
import { calculateTotal, type Order } from "./orders/order.js";

/** Loaded on demand by Shop.salesReport through a dynamic import. */
export function buildSalesReport(orders: readonly Order[]): string {
  const rows: string[] = [];
  for (const [status, group] of groupBy(orders, (order) => order.status)) {
    const totalCents = sumBy(group, (order) => calculateTotal(order.lines).amountCents);
    rows.push(`${status.padEnd(10)} ${String(group.length).padStart(4)} ${formatMoney(totalCents)}`);
  }
  return rows.join("\n");
}
