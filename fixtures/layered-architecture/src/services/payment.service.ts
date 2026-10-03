import { NotFoundError, ValidationError } from "@/shared/errors";
import type { Logger } from "@/shared/logger";
import { formatAmount, isRefundable, type Payment } from "../models/payment";
import { PaymentRepository } from "../repositories/payment.repository";
import { PaymentGateway } from "./payment-gateway";
import { UserService } from "./user.service";

export interface PaymentRequest {
  orderId: string;
  userId: string;
  amountCents: number;
  currency: string;
}

export class PaymentService {
  constructor(
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGateway,
    private readonly users: UserService,
    private readonly logger: Logger,
  ) {}

  async pay(request: PaymentRequest): Promise<Payment> {
    if (!Number.isInteger(request.amountCents) || request.amountCents <= 0) {
      throw new ValidationError("Amount must be a positive number of cents", "amountCents");
    }
    const user = await this.users.getById(request.userId);
    const payment = await this.payments.insert({ ...request, status: "pending", providerReference: null });

    const result = await this.gateway.charge({
      amountCents: request.amountCents,
      currency: request.currency,
      customerEmail: user.email,
      description: `Order ${request.orderId}`,
    });
    const status = result.status === "succeeded" ? "captured" : "failed";
    await this.payments.updateStatus(payment.id, status, result.reference);

    this.logger.info("Payment processed", {
      paymentId: payment.id,
      status,
      amount: formatAmount(request.amountCents, request.currency),
    });
    return { ...payment, status, providerReference: result.reference };
  }

  async refund(paymentId: string): Promise<Payment> {
    const payment = await this.payments.findById(paymentId);
    if (payment === undefined) {
      throw new NotFoundError("Payment", paymentId);
    }
    if (!isRefundable(payment) || payment.providerReference === null) {
      throw new ValidationError(`Payment ${paymentId} can no longer be refunded`);
    }
    await this.gateway.refund(payment.providerReference, payment.amountCents);
    await this.payments.updateStatus(payment.id, "refunded");
    this.logger.info("Payment refunded", { paymentId });
    return { ...payment, status: "refunded" };
  }

  listForOrder(orderId: string): Promise<Payment[]> {
    return this.payments.findByOrder(orderId);
  }
}
