import { randomUUID } from "node:crypto";
import { createLogger } from "../core/logger";
import { NotFoundError } from "../core/errors";
import type { OrderRecord, OrderStore } from "../storage/order.store";
import type { InventoryService } from "./inventory.service";
import type { PaymentService } from "./payment.service";

const log = createLogger("services.orders");

export class OrderService {
  constructor(
    private readonly orders: OrderStore,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentService,
  ) {}

  async place(userId: string, sku: string, quantity: number): Promise<OrderRecord> {
    const product = await this.inventory.reserve(sku, quantity);
    const order: OrderRecord = {
      id: randomUUID(),
      userId,
      sku,
      quantity,
      totalCents: product.priceCents * quantity,
      state: "open",
      createdAt: new Date(),
    };
    await this.orders.insert(order);
    log.info("order placed", { id: order.id, userId });
    return order;
  }

  async pay(orderId: string, cardToken: string): Promise<OrderRecord> {
    const order = await this.orders.findById(orderId);
    if (order === undefined) throw new NotFoundError("Order", orderId);
    const result = await this.payments.capture(order.id, order.totalCents, cardToken);
    if (result.status === "declined") {
      log.warn("payment declined", { orderId });
      return order;
    }
    await this.orders.updateState(order.id, "paid");
    return { ...order, state: "paid" };
  }

  async cancel(orderId: string): Promise<void> {
    await this.orders.updateState(orderId, "cancelled");
    log.info("order cancelled", { orderId });
  }
}
