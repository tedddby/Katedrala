import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Payment, PaymentStatus } from "../payments/entities/payment.entity";
import { PaymentsService } from "../payments/payments.service";
import type { CreateOrderDto } from "./dto/create-order.dto";
import { Order, OrderStatus } from "./entities/order.entity";

@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    private readonly paymentsService: PaymentsService,
  ) {}

  findAll(customerId?: string): Promise<Order[]> {
    return this.orders.find({
      where: customerId === undefined ? {} : { customerId },
      order: { createdAt: "DESC" },
      take: 100,
    });
  }

  async findOne(id: string): Promise<Order> {
    const order = await this.orders.findOne({ where: { id }, relations: { payments: true } });
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  create(dto: CreateOrderDto): Promise<Order> {
    return this.orders.save(this.orders.create({ ...dto, status: OrderStatus.Open }));
  }

  async pay(id: string, paymentMethodId: string): Promise<Payment> {
    const order = await this.findOne(id);
    if (order.status !== OrderStatus.Open) {
      throw new ConflictException(`Order ${id} is ${order.status}`);
    }
    const payment = await this.paymentsService.create({
      orderId: order.id,
      amountCents: order.totalCents - order.paidCents,
      currency: order.currency,
      paymentMethodId,
    });
    if (payment.status === PaymentStatus.Succeeded) {
      order.status = OrderStatus.Paid;
      await this.orders.save(order);
    }
    return payment;
  }

  async cancel(id: string): Promise<Order> {
    const order = await this.findOne(id);
    if (order.status === OrderStatus.Paid) {
      throw new ConflictException(`Order ${id} is already paid and must be refunded instead`);
    }
    order.status = OrderStatus.Cancelled;
    return this.orders.save(order);
  }
}
