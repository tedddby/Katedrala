import { formatMoney, money, type Money } from "@/utils/money";
import { calculateTotal, type Order } from "@/orders/order";
import { Tax } from "./tax.js";

export class Invoice {
  private static sequence = 0;
  readonly number: string;

  constructor(
    readonly orderId: string,
    readonly net: Money,
    readonly taxRate: number,
  ) {
    Invoice.sequence += 1;
    this.number = `INV-${String(Invoice.sequence).padStart(6, "0")}`;
  }

  get tax(): Money {
    return money(this.net.amountCents * this.taxRate, this.net.currency);
  }

  get gross(): Money {
    return money(this.net.amountCents + this.tax.amountCents, this.net.currency);
  }

  render(format: Invoice.Format = "text"): string {
    const rows = [
      `Invoice ${this.number} (order ${this.orderId})`,
      `Net:   ${formatMoney(this.net)}`,
      `Tax:   ${formatMoney(this.tax)} (${(this.taxRate * 100).toFixed(1)}%)`,
      `Total: ${formatMoney(this.gross)}`,
    ];
    return format === "html" ? rows.map((row) => `<p>${row}</p>`).join("") : rows.join("\n");
  }
}

/** Factory helpers live on a namespace merged with the class. */
export namespace Invoice {
  export type Format = "text" | "html";

  export function fromOrder(order: Order, country: string, region?: string): Invoice {
    return new Invoice(order.id, calculateTotal(order.lines), Tax.rateFor(country, region));
  }
}
