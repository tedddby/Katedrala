import { track } from "../analytics/tracker";
import type { ChargeResult, PaymentGateway } from "./payment-gateway";

export interface PaymentRequest {
  orderId: string;
  amountCents: number;
  currency: string;
  cardToken: string;
}

export interface Receipt {
  orderId: string;
  chargeId: string;
  amountCents: number;
}

export class PaymentDeclinedError extends Error {
  constructor(
    readonly orderId: string,
    readonly declineCode: string | undefined,
  ) {
    super(`Payment for order ${orderId} was declined (${declineCode ?? "unknown"})`);
    this.name = "PaymentDeclinedError";
  }
}

export class CheckoutService {
  constructor(private readonly gateway: PaymentGateway) {}

  async pay(request: PaymentRequest): Promise<Receipt> {
    track("checkout_started", { orderId: request.orderId, amountCents: request.amountCents });

    const result: ChargeResult = await this.gateway.charge({
      amountCents: request.amountCents,
      currency: request.currency,
      cardToken: request.cardToken,
      reference: request.orderId,
    });

    if (result.status !== "succeeded") {
      track("payment_declined", { orderId: request.orderId, declineCode: result.declineCode ?? "unknown" });
      throw new PaymentDeclinedError(request.orderId, result.declineCode);
    }

    track("payment_succeeded", { orderId: request.orderId, chargeId: result.chargeId });
    return { orderId: request.orderId, chargeId: result.chargeId, amountCents: request.amountCents };
  }
}
