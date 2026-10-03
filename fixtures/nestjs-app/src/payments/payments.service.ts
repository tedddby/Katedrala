import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import type { CreatePaymentDto } from "./dto/create-payment.dto";
import { Payment, PaymentStatus } from "./entities/payment.entity";
import { StripeClient } from "./stripe.client";

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly repo: Repository<Payment>,
    private readonly stripe: StripeClient,
  ) {}

  async findOne(id: string): Promise<Payment> {
    const payment = await this.repo.findOne({ where: { id } });
    if (!payment) {
      throw new NotFoundException(`Payment ${id} not found`);
    }
    return payment;
  }

  findByOrder(orderId: string): Promise<Payment[]> {
    return this.repo.find({ where: { orderId }, order: { createdAt: "DESC" } });
  }

  async create(dto: CreatePaymentDto): Promise<Payment> {
    const payment = await this.repo.save(
      this.repo.create({
        orderId: dto.orderId,
        amountCents: dto.amountCents,
        currency: dto.currency,
        status: PaymentStatus.Pending,
        providerReference: null,
      }),
    );
    const result = await this.stripe.charge(dto.orderId, dto.amountCents, dto.currency, dto.paymentMethodId);
    payment.providerReference = result.reference;
    payment.status = result.succeeded ? PaymentStatus.Succeeded : PaymentStatus.Failed;
    return this.repo.save(payment);
  }
}
