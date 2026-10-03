import Stripe from "stripe";

export interface CardCharge {
  id: string;
  status: "succeeded" | "failed";
}

export class StripeAdapter {
  private readonly client: Stripe;

  constructor(secretKey: string) {
    this.client = new Stripe(secretKey);
  }

  async charge(amountCents: number, currency: string, paymentMethodId: string, orderId: string): Promise<CardCharge> {
    const intent = await this.client.paymentIntents.create(
      {
        amount: amountCents,
        currency: currency.toLowerCase(),
        payment_method: paymentMethodId,
        confirm: true,
        metadata: { orderId },
      },
      { idempotencyKey: `order-${orderId}` },
    );
    return { id: intent.id, status: intent.status === "succeeded" ? "succeeded" : "failed" };
  }

  async refund(paymentIntentId: string): Promise<void> {
    await this.client.refunds.create({ payment_intent: paymentIntentId });
  }
}
