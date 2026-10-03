import { createLogger } from "../core/logger";
import { UpstreamError } from "../core/errors";

const log = createLogger("services.payments");

export interface PaymentResult {
  paymentId: string;
  status: "captured" | "declined";
}

export class PaymentService {
  constructor(private readonly apiUrl: string) {}

  async capture(orderId: string, amountCents: number, cardToken: string): Promise<PaymentResult> {
    const response = await fetch(`${this.apiUrl}/captures`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": orderId },
      body: JSON.stringify({ reference: orderId, amountCents, cardToken }),
    });
    if (!response.ok) {
      throw new UpstreamError("payment API", response.status);
    }
    const result = (await response.json()) as PaymentResult;
    log.info("payment processed", { orderId, status: result.status });
    return result;
  }
}
