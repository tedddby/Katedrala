import type { Request, Response } from "express";
import { displayName } from "../domain/customer";
import { CustomerService } from "../services/customer.service";
import { OrderService } from "../services/order.service";

export class CustomerController {
  constructor(
    private readonly customers: CustomerService,
    private readonly orders: OrderService,
  ) {}

  async register(req: Request, res: Response): Promise<void> {
    const { email, name } = req.body as { email: string; name: string };
    const customer = await this.customers.register(email, name);
    res.status(201).json(customer);
  }

  async show(req: Request, res: Response): Promise<void> {
    const customer = await this.customers.getCustomer(req.params.id);
    res.json({ ...customer, displayName: displayName(customer) });
  }

  async orderHistory(req: Request, res: Response): Promise<void> {
    const orders = await this.orders.listForCustomer(req.params.id);
    res.json({ customerId: req.params.id, orders });
  }
}
