import { Router } from "express";
import { createOrder, getOrder } from "../controllers/orders.controller.js";
import { authMiddleware } from "../middleware/auth.js";

export const ordersRouter = Router();

ordersRouter.post("/orders", authMiddleware, createOrder);
ordersRouter.get("/orders/:id", authMiddleware, getOrder);
