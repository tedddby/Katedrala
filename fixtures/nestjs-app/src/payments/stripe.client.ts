import { BadGatewayException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "../config/config.service";

export interface ChargeResult {
  reference: string;
  succeeded: boolean;
}

interface PaymentIntentResponse {
  id: string;
  status: "succeeded" | "processing" | "requires_action" | "requires_payment_method" | "canceled";
}

/** Thin client for the Stripe PaymentIntents API. */
@Injectable()
export class StripeClient {
  private readonly logger = new Logger(StripeClient.name);

  constructor(private readonly config: ConfigService) {}

  async charge(orderId: string, amountCents: number, currency: string, paymentMethodId: string): Promise<ChargeResult> {
    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.stripeApiKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `order-${orderId}-${amountCents}`,
      },
      body: new URLSearchParams({
        amount: String(amountCents),
        currency,
        payment_method: paymentMethodId,
        confirm: "true",
        "metadata[order_id]": orderId,
      }),
    });
    if (!response.ok) {
      this.logger.error(`Stripe answered ${response.status} for order ${orderId}`);
      throw new BadGatewayException("Payment provider unavailable");
    }
    const intent = (await response.json()) as PaymentIntentResponse;
    return { reference: intent.id, succeeded: intent.status === "succeeded" };
  }
}
