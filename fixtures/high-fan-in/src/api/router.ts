import { Router } from "express";
import { createLogger } from "../core/logger";
import type { OrderService } from "../services/order.service";
import type { UserService } from "../services/user.service";
import { orderRoutes } from "./orders.routes";
import { userRoutes } from "./users.routes";

const log = createLogger("api.router");

export interface RouteServices {
  users: UserService;
  orders: OrderService;
}

export function createRouter(services: RouteServices): Router {
  const router = Router();
  router.use((req, _res, next) => {
    log.debug("request", { method: req.method, path: req.path });
    next();
  });
  router.use("/users", userRoutes(services.users));
  router.use("/orders", orderRoutes(services.orders));
  router.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  return router;
}
