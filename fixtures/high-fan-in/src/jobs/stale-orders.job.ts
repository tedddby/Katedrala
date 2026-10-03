import { createLogger } from "../core/logger";
import type { OrderService } from "../services/order.service";
import type { OrderStore } from "../storage/order.store";

const log = createLogger("jobs.stale-orders");

export class StaleOrdersJob {
  readonly name = "stale-orders";
  readonly intervalMs = 15 * 60 * 1000;

  constructor(
    private readonly orders: OrderStore,
    private readonly service: OrderService,
    private readonly maxAgeMs = 2 * 60 * 60 * 1000,
  ) {}

  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - this.maxAgeMs);
    const stale = await this.orders.listOpenOlderThan(cutoff);
    for (const order of stale) {
      await this.service.cancel(order.id);
    }
    if (stale.length > 0) {
      log.info("cancelled stale orders", { count: stale.length });
    }
  }
}
