import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import { canTransition, orderTotal, type Order } from "../models/order";
import { isValidLine, type OrderLine } from "../models/order-line";
import { OrderRepository } from "../repositories/order.repository";
import { PaymentService } from "./payment.service";
import { UserService } from "./user.service";

export class OrderService {
  constructor(
    private readonly orders: OrderRepository,
    private readonly users: UserService,
    private readonly payments: PaymentService,
  ) {}

  async createDraft(customerId: string, lines: OrderLine[], currency = "EUR"): Promise<Order> {
    // Throws NotFoundError for unknown customers.
    await this.users.getById(customerId);
    if (lines.length === 0 || !lines.every(isValidLine)) {
      throw new ValidationError("An order needs at least one valid line", "lines");
    }
    return this.orders.insert({ customerId, lines, currency, status: "draft", placedAt: null });
  }

  async get(orderId: string): Promise<Order> {
    const order = await this.orders.findById(orderId);
    if (order === undefined) {
      throw new NotFoundError("Order", orderId);
    }
    return order;
  }

  async checkout(orderId: string): Promise<Order> {
    const order = await this.get(orderId);
    if (!canTransition(order.status, "placed")) {
      throw new ConflictError(`Order ${orderId} cannot be placed while it is ${order.status}`);
    }

    const placedAt = new Date();
    await this.orders.updateStatus(order.id, "placed", placedAt);

    const payment = await this.payments.pay({
      orderId: order.id,
      userId: order.customerId,
      amountCents: orderTotal(order),
      currency: order.currency,
    });
    if (payment.status !== "captured") {
      return { ...order, status: "placed", placedAt };
    }
    await this.orders.updateStatus(order.id, "paid");
    return { ...order, status: "paid", placedAt };
  }

  async cancel(orderId: string): Promise<Order> {
    const order = await this.get(orderId);
    if (!canTransition(order.status, "cancelled")) {
      throw new ConflictError(`Order ${orderId} cannot be cancelled while it is ${order.status}`);
    }
    await this.orders.updateStatus(order.id, "cancelled");
    return { ...order, status: "cancelled" };
  }

  listForCustomer(customerId: string): Promise<Order[]> {
    return this.orders.findByCustomer(customerId);
  }
}
