export interface ChargeRequest {
  amountCents: number;
  currency: string;
  cardToken: string;
  reference: string;
}

export interface ChargeResult {
  chargeId: string;
  status: "succeeded" | "declined";
  declineCode?: string;
}

export interface PaymentGateway {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  refund(chargeId: string, amountCents: number): Promise<void>;
}

export class HttpPaymentGateway implements PaymentGateway {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.payments.example.com",
  ) {}

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const response = await fetch(`${this.baseUrl}/v1/charges`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(request),
    });
    if (!response.ok && response.status !== 402) {
      throw new Error(`Payment provider responded with ${response.status}`);
    }
    return (await response.json()) as ChargeResult;
  }

  async refund(chargeId: string, amountCents: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/v1/charges/${chargeId}/refunds`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ amountCents }),
    });
    if (!response.ok) {
      throw new Error(`Refund of ${chargeId} failed with ${response.status}`);
    }
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" };
  }
}
