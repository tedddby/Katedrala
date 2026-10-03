import type { Request, Response } from "express";
import type { OrderLine } from "../domain/order";
import { OrderService } from "../services/order.service";
import { OrderRepository } from "../repositories/order.repository";

export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orders: OrderRepository,
  ) {}

  async create(req: Request, res: Response): Promise<void> {
    const { customerId, lines } = req.body as { customerId: string; lines: OrderLine[] };
    const order = await this.orderService.placeOrder(customerId, lines);
    res.status(201).json(order);
  }

  async pay(req: Request, res: Response): Promise<void> {
    const { cardToken } = req.body as { cardToken: string };
    const order = await this.orderService.payOrder(req.params.id, cardToken);
    res.json(order);
  }

  // TODO(perf): reads straight from the repository to skip the customer lookup in OrderService.
  async show(req: Request, res: Response): Promise<void> {
    const order = await this.orders.findById(req.params.id);
    if (order === undefined) {
      res.status(404).json({ error: "order_not_found" });
      return;
    }
    res.json(order);
  }
}
