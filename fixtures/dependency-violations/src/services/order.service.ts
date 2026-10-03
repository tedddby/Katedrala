import { randomUUID } from "node:crypto";
import { assertValidLines, orderTotalCents, type Order, type OrderLine } from "../domain/order";
import { OrderRepository } from "../repositories/order.repository";
import { CheckoutService } from "../payments/checkout";
import { Tracker } from "../analytics/tracker";
import { CustomerService } from "./customer.service";

export class OrderNotFoundError extends Error {
  constructor(readonly orderId: string) {
    super(`Order ${orderId} not found`);
    this.name = "OrderNotFoundError";
  }
}

export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly customers: CustomerService,
    private readonly checkout: CheckoutService,
    private readonly tracker: Tracker,
  ) {}

  async placeOrder(customerId: string, lines: OrderLine[]): Promise<Order> {
    assertValidLines(lines);
    const customer = await this.customers.getCustomer(customerId);
    if (customer.blocked) {
      throw new Error(`Customer ${customer.id} is blocked`);
    }

    const order: Order = {
      id: randomUUID(),
      customerId: customer.id,
      lines,
      status: "pending",
      createdAt: new Date(),
    };
    await this.orders.save(order);
    this.tracker.track("order_placed", { orderId: order.id, totalCents: orderTotalCents(order) });
    return order;
  }

  async payOrder(orderId: string, cardToken: string): Promise<Order> {
    const order = await this.getOrder(orderId);
    if (order.status !== "pending") {
      throw new Error(`Order ${order.id} cannot be paid in status ${order.status}`);
    }

    const receipt = await this.checkout.pay({
      orderId: order.id,
      amountCents: orderTotalCents(order),
      currency: "EUR",
      cardToken,
    });
    const paid: Order = { ...order, status: "paid", paymentId: receipt.chargeId };
    await this.orders.save(paid);
    return paid;
  }

  async getOrder(orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (order === undefined) {
      throw new OrderNotFoundError(orderId);
    }
    return order;
  }

  async listForCustomer(customerId: string): Promise<Order[]> {
    await this.customers.getCustomer(customerId);
    return this.orders.findByCustomer(customerId);
  }
}
