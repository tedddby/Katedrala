import { startServer } from "./api/server";
import { loadConfig } from "./core/config";
import { EmailDigestJob } from "./jobs/email-digest.job";
import { InventorySyncJob } from "./jobs/inventory-sync.job";
import { NightlyReportJob } from "./jobs/nightly-report.job";
import { startScheduler } from "./jobs/scheduler";
import { StaleOrdersJob } from "./jobs/stale-orders.job";
import { EmailService } from "./services/email.service";
import { InventoryService } from "./services/inventory.service";
import { OrderService } from "./services/order.service";
import { PaymentService } from "./services/payment.service";
import { UserService } from "./services/user.service";
import { TtlCache } from "./storage/cache";
import { connectDatabase } from "./storage/database";
import { OrderStore } from "./storage/order.store";
import { ProductStore } from "./storage/product.store";
import { UserStore } from "./storage/user.store";

async function main(): Promise<void> {
  const config = loadConfig();
  const db = await connectDatabase(config.databaseUrl);

  const users = new UserStore(db);
  const orders = new OrderStore(db);
  const products = new ProductStore(db);

  const email = new EmailService(config.mailApiUrl, config.mailApiToken);
  const inventory = new InventoryService(products, new TtlCache("products", 60_000), config.inventoryApiUrl);
  const orderService = new OrderService(orders, inventory, new PaymentService(config.paymentApiUrl));
  const userService = new UserService(users, email);

  const server = startServer(config, { users: userService, orders: orderService });
  const scheduler = startScheduler([
    new NightlyReportJob(orders, email, config.reportRecipients),
    new StaleOrdersJob(orders, orderService),
    new InventorySyncJob(inventory),
    new EmailDigestJob(users, email),
  ]);

  process.once("SIGTERM", () => {
    scheduler.stop();
    server.close(() => void db.close());
  });
}

main().catch((error: unknown) => {
  console.error("fatal: service failed to start", error);
  process.exitCode = 1;
});
