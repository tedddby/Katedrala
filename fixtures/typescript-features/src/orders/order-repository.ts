import { Repository } from "../shared/repository.js";
import type { Order } from "./order.js";

export class OrderRepository extends Repository<Order> {
  protected override readonly entityName = "Order";
  private readonly orders = new Map<string, Order>();

  override async findById(id: string): Promise<Order | undefined> {
    return this.orders.get(id);
  }

  override async save(order: Order): Promise<void> {
    this.orders.set(order.id, { ...order });
  }

  findBy(customerId: string): Promise<Order[]>;
  findBy(predicate: (order: Order) => boolean): Promise<Order[]>;
  async findBy(filter: string | ((order: Order) => boolean)): Promise<Order[]> {
    const matches = typeof filter === "string" ? (order: Order) => order.customerId === filter : filter;
    return [...this.orders.values()].filter(matches);
  }

  get size(): number {
    return this.orders.size;
  }
}
