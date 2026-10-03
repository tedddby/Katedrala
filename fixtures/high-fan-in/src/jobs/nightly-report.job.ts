import { createLogger } from "../core/logger";
import type { EmailService } from "../services/email.service";
import type { OrderStore } from "../storage/order.store";

const log = createLogger("jobs.nightly-report");
const DAY_MS = 24 * 60 * 60 * 1000;

export class NightlyReportJob {
  readonly name = "nightly-report";
  readonly intervalMs = DAY_MS;

  constructor(
    private readonly orders: OrderStore,
    private readonly email: EmailService,
    private readonly recipients: readonly string[],
  ) {}

  async run(): Promise<void> {
    const to = new Date();
    const from = new Date(to.getTime() - DAY_MS);
    const orders = await this.orders.listCreatedBetween(from, to);
    const revenueCents = orders
      .filter((order) => order.state !== "cancelled")
      .reduce((sum, order) => sum + order.totalCents, 0);
    const body = `Orders: ${orders.length}\nRevenue: ${(revenueCents / 100).toFixed(2)} EUR`;
    for (const recipient of this.recipients) {
      await this.email.send(recipient, `Daily report ${to.toISOString().slice(0, 10)}`, body);
    }
    log.info("report sent", { orders: orders.length, recipients: this.recipients.length });
  }
}
