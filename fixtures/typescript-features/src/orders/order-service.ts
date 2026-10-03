import { randomUUID } from "node:crypto";
import { Inject, Injectable, Log, Required } from "../decorators.js";
import { OrderRepository } from "./order-repository.js";
import { calculateTotal, isOpen, OrderStatus, type Order } from "./order.js";
import type { OrderInput } from "./order.js";
import { type Money } from "@/utils/money";

export interface PlacedOrder {
  readonly order: Order;
  readonly total: Money;
}

@Injectable("orders")
export class OrderService {
  @Required()
  currency: Money["currency"] = "EUR";

  constructor(
    private readonly repo: OrderRepository,
    @Inject("clock") private readonly now: () => Date = () => new Date(),
  ) {}

  @Log("orders.place")
  async place(input: OrderInput): Promise<PlacedOrder> {
    const order: Order = {
      id: randomUUID(),
      customerId: input.customerId,
      lines: input.lines,
      status: OrderStatus.Pending,
      priority: input.priority,
      notes: `placed ${this.now().toISOString()}`,
    };
    await this.repo.save(order);
    return { order, total: calculateTotal(order.lines) };
  }

  @Log()
  async cancel(orderId: string): Promise<Order> {
    const order = await this.repo.getOrThrow(orderId);
    if (!isOpen(order)) {
      throw new Error(`Order ${orderId} can no longer be cancelled`);
    }
    const cancelled: Order = { ...order, status: OrderStatus.Cancelled };
    await this.repo.save(cancelled);
    return cancelled;
  }

  async history(customerId: string): Promise<Order[]> {
    return this.repo.findBy(customerId);
  }
}
