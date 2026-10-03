import express, { type NextFunction, type Request, type Response } from "express";
import { tracker } from "./analytics/tracker";
import { loadConfig } from "./config";
import { CustomerController } from "./controllers/customer.controller";
import { OrderController } from "./controllers/order.controller";
import { RefundController } from "./controllers/refund.controller";
import { CheckoutService } from "./payments/checkout";
import { HttpPaymentGateway } from "./payments/payment-gateway";
import { RefundProcessor } from "./payments/refunds";
import { CustomerRepository } from "./repositories/customer.repository";
import { Database } from "./repositories/database";
import { OrderRepository } from "./repositories/order.repository";
import { CustomerService } from "./services/customer.service";
import { OrderService } from "./services/order.service";
import { RefundService } from "./services/refund.service";

type Handler = (req: Request, res: Response) => Promise<void>;

function route(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

export function createApp(db: Database, paymentsApiKey: string): express.Express {
  const orderRepository = new OrderRepository(db);
  const customerRepository = new CustomerRepository(db);
  const gateway = new HttpPaymentGateway(paymentsApiKey);

  const customerService = new CustomerService(customerRepository);
  const orderService = new OrderService(orderRepository, customerService, new CheckoutService(gateway), tracker);
  const refundService = new RefundService(orderRepository, new RefundProcessor(gateway), tracker);

  const orderController = new OrderController(orderService, orderRepository);
  const customerController = new CustomerController(customerService, orderService);
  const refundController = new RefundController(refundService);

  const app = express();
  app.use(express.json());
  app.post("/customers", route((req, res) => customerController.register(req, res)));
  app.get("/customers/:id", route((req, res) => customerController.show(req, res)));
  app.get("/customers/:id/orders", route((req, res) => customerController.orderHistory(req, res)));
  app.post("/orders", route((req, res) => orderController.create(req, res)));
  app.get("/orders/:id", route((req, res) => orderController.show(req, res)));
  app.post("/orders/:id/payment", route((req, res) => orderController.pay(req, res)));
  app.post("/orders/:id/refunds", route((req, res) => refundController.create(req, res)));
  return app;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = new Database(config.databaseUrl);
  const app = createApp(db, config.paymentsApiKey);
  const server = app.listen(config.port, () => {
    console.log(`order-backend listening on :${config.port}`);
  });

  process.once("SIGTERM", () => {
    server.close();
    void Promise.all([tracker.flush(), db.close()]);
  });
}

void main();
