import type { Request, Response } from "express";
import { RefundService } from "../services/refund.service";

export class RefundController {
  constructor(private readonly refunds: RefundService) {}

  async create(req: Request, res: Response): Promise<void> {
    const { reason } = req.body as { reason?: string };
    const order = await this.refunds.refundOrder(req.params.id, reason ?? "customer_request");
    res.status(201).json({ orderId: order.id, status: order.status });
  }
}
