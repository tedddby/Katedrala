import type { StripeClient } from "../clients/stripe.client.js";
import { NotFoundError, ValidationError } from "../errors.js";
import { logger } from "../logger.js";
import { orderTotal } from "../models/order.js";
import type { CreateOrderInput, Order } from "../models/order.js";
import type { OrderRepository } from "../repositories/order.repository.js";
import type { UserService } from "./user.service.js";

const SUPPORTED_CURRENCIES = new Set(["usd", "eur", "gbp"]);

export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly users: UserService,
    private readonly stripe: StripeClient,
  ) {}

  async getForUser(orderId: string, userId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (order === undefined || order.userId !== userId) {
      throw new NotFoundError("Order", orderId);
    }
    return order;
  }

  async placeOrder(userId: string, input: CreateOrderInput): Promise<Order> {
    if (input.items.length === 0) {
      throw new ValidationError("an order needs at least one item");
    }
    if (!SUPPORTED_CURRENCIES.has(input.currency)) {
      throw new ValidationError(`unsupported currency ${input.currency}`);
    }
    const customer = await this.users.getById(userId);
    const order = await this.orders.create({
      userId: customer.id,
      status: "pending",
      items: input.items,
      totalCents: orderTotal(input.items),
      currency: input.currency,
      chargeId: null,
    });
    try {
      const charge = await this.stripe.createCharge(
        order.totalCents,
        order.currency,
        input.paymentSource,
        `Order ${order.id} for ${customer.email}`,
      );
      await this.orders.updatePayment(order.id, "paid", charge.id);
      logger.info("order paid", { orderId: order.id, chargeId: charge.id });
      return { ...order, status: "paid", chargeId: charge.id };
    } catch (error) {
      await this.orders.updatePayment(order.id, "failed", null);
      throw error;
    }
  }
}
