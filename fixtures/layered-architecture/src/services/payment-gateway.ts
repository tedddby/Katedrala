import { randomUUID } from "node:crypto";
import type { AppConfig } from "@/shared/config";
import { AppError } from "@/shared/errors";

export interface ChargeRequest {
  amountCents: number;
  currency: string;
  customerEmail: string;
  description: string;
}

export interface ChargeResult {
  reference: string;
  status: "succeeded" | "declined";
}

/** HTTP client for the external card payment provider. */
export class PaymentGateway {
  constructor(private readonly config: Pick<AppConfig, "paymentProviderUrl" | "paymentProviderKey">) {}

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const payload = await this.post<{ id: string; status: string }>("/charges", {
      amount: request.amountCents,
      currency: request.currency.toLowerCase(),
      receipt_email: request.customerEmail,
      description: request.description,
    });
    return { reference: payload.id, status: payload.status === "succeeded" ? "succeeded" : "declined" };
  }

  async refund(reference: string, amountCents: number): Promise<void> {
    await this.post("/refunds", { charge: reference, amount: amountCents });
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.config.paymentProviderUrl}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.paymentProviderKey}`,
        "content-type": "application/json",
        "idempotency-key": randomUUID(),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new AppError(`Payment provider responded with ${response.status}`, 502, "payment_provider_error");
    }
    return (await response.json()) as T;
  }
}
