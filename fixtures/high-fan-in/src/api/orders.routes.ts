import { Router } from "express";
import { createLogger } from "../core/logger";
import type { OrderService } from "../services/order.service";

const log = createLogger("api.orders");

export function orderRoutes(orders: OrderService): Router {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const { userId, sku, quantity } = req.body as { userId: string; sku: string; quantity: number };
      const order = await orders.place(userId, sku, quantity);
      log.info("order created", { id: order.id, sku });
      res.status(201).json(order);
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/payment", async (req, res, next) => {
    try {
      const { cardToken } = req.body as { cardToken: string };
      res.json(await orders.pay(req.params.id, cardToken));
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      await orders.cancel(req.params.id);
      log.info("order cancelled by client", { id: req.params.id });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
