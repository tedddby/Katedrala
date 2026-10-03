import { Router } from "express";
import { ordersRouter } from "./orders.routes.js";
import usersRouter from "./users.routes.js";

const router = Router();

router.use(usersRouter);
router.use(ordersRouter);

export default router;
