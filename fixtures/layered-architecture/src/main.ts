import { OrderController } from "./controllers/order.controller";
import { PaymentController } from "./controllers/payment.controller";
import { UserController } from "./controllers/user.controller";
import { OrderRepository } from "./repositories/order.repository";
import { PaymentRepository } from "./repositories/payment.repository";
import { UserRepository } from "./repositories/user.repository";
import { OrderService } from "./services/order.service";
import { PaymentGateway } from "./services/payment-gateway";
import { PaymentService } from "./services/payment.service";
import { UserService } from "./services/user.service";
import { loadConfig } from "./shared/config";
import { Database } from "./shared/database";
import { Router, startServer } from "./shared/http";
import { createLogger } from "./shared/logger";

const config = loadConfig();
const logger = createLogger(config.logLevel);
const db = new Database(config.databaseUrl);

// Manual dependency injection: repositories -> services -> controllers.
const users = new UserService(new UserRepository(db), logger.child({ module: "users" }));
const payments = new PaymentService(
  new PaymentRepository(db),
  new PaymentGateway(config),
  users,
  logger.child({ module: "payments" }),
);
const orders = new OrderService(new OrderRepository(db), users, payments);

const router = new Router();
for (const controller of [new UserController(users), new OrderController(orders), new PaymentController(payments)]) {
  controller.register(router);
}

const server = startServer(router, config.port, logger);

process.on("SIGTERM", () => {
  logger.info("Shutting down");
  server.close(() => {
    void db.close();
  });
});
