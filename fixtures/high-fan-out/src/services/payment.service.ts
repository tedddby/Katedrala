import type { PaypalAdapter } from "../adapters/paypal.adapter";
import type { StripeAdapter } from "../adapters/stripe.adapter";

export interface PaymentReceipt {
  provider: "stripe" | "paypal";
  reference: string;
}

export class PaymentDeclinedError extends Error {
  constructor(
    readonly orderId: string,
    readonly method: "card" | "paypal",
  ) {
    super(`Payment for order ${orderId} was declined (${method})`);
    this.name = "PaymentDeclinedError";
  }
}

export class PaymentService {
  constructor(
    private readonly stripe: StripeAdapter,
    private readonly paypal: PaypalAdapter,
    private readonly currency = "EUR",
  ) {}

  async collect(method: "card" | "paypal", token: string, amountCents: number, orderId: string): Promise<PaymentReceipt> {
    if (method === "card") {
      const charge = await this.stripe.charge(amountCents, this.currency, token, orderId);
      if (charge.status !== "succeeded") throw new PaymentDeclinedError(orderId, method);
      return { provider: "stripe", reference: charge.id };
    }
    const capture = await this.paypal.capture(token, orderId);
    if (capture.status !== "COMPLETED") throw new PaymentDeclinedError(orderId, method);
    return { provider: "paypal", reference: capture.id };
  }
}
