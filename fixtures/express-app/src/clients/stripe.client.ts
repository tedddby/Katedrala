import { PaymentFailedError } from "../errors.js";
import { logger } from "../logger.js";

export interface Charge {
  id: string;
  status: "succeeded" | "pending" | "failed";
  amount: number;
  currency: string;
}

interface StripeErrorBody {
  error?: { message?: string; code?: string };
}

/** Minimal Stripe API client: only what the checkout flow needs. */
export class StripeClient {
  constructor(private readonly secretKey: string) {}

  async createCharge(amountCents: number, currency: string, source: string, description: string): Promise<Charge> {
    const response = await fetch("https://api.stripe.com/v1/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(amountCents),
        currency,
        source,
        description,
      }),
    });
    if (!response.ok) {
      const body = (await response.json()) as StripeErrorBody;
      logger.warn("stripe charge failed", { status: response.status, code: body.error?.code });
      throw new PaymentFailedError(body.error?.message ?? "The card was declined");
    }
    return (await response.json()) as Charge;
  }
}
