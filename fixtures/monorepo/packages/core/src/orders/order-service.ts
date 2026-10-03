import { err, ok, type Result } from "@acme/shared";
import type { Catalog } from "../catalog/catalog";
import { lineFor, totalOf, type Order, type OrderLine } from "./order";

export type OrderError =
  | { code: "empty-order" }
  | { code: "unknown-product"; productId: string }
  | { code: "out-of-stock"; productId: string; available: number };

export interface OrderRequest {
  customerEmail: string;
  items: Array<{ productId: string; quantity: number }>;
}

export class OrderService {
  private sequence = 0;
  private readonly orders: Order[] = [];

  constructor(private readonly catalog: Catalog) {}

  placeOrder(request: OrderRequest): Result<Order, OrderError> {
    if (request.items.length === 0) {
      return err({ code: "empty-order" });
    }

    const lines: OrderLine[] = [];
    for (const item of request.items) {
      const product = this.catalog.find(item.productId);
      if (product === undefined) {
        return err({ code: "unknown-product", productId: item.productId });
      }
      if (product.stock < item.quantity) {
        return err({ code: "out-of-stock", productId: product.id, available: product.stock });
      }
      lines.push(lineFor(product, item.quantity));
    }

    for (const item of request.items) {
      this.catalog.reserve(item.productId, item.quantity);
    }
    this.sequence += 1;
    const order: Order = {
      id: `ord-${String(this.sequence).padStart(6, "0")}`,
      customerEmail: request.customerEmail,
      lines,
      total: totalOf(lines),
      createdAt: new Date(),
    };
    this.orders.push(order);
    return ok(order);
  }

  ordersFor(customerEmail: string): Order[] {
    return this.orders.filter((order) => order.customerEmail === customerEmail);
  }
}
