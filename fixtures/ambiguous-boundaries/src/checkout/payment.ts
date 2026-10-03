export interface PaymentAuthorization {
  id: string;
  status: "authorized" | "declined";
  amountCents: number;
}

const PSP_URL = process.env.PSP_URL ?? "https://psp.example.com/v1";

export async function authorizePayment(orderId: string, amountCents: number, cardToken: string): Promise<PaymentAuthorization> {
  const response = await fetch(`${PSP_URL}/authorizations`, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": orderId },
    body: JSON.stringify({ reference: orderId, amountCents, currency: "EUR", cardToken }),
  });
  if (!response.ok) {
    throw new Error(`Payment provider responded with ${response.status}`);
  }
  return (await response.json()) as PaymentAuthorization;
}

export async function voidAuthorization(authorizationId: string): Promise<void> {
  await fetch(`${PSP_URL}/authorizations/${authorizationId}/void`, { method: "POST" });
}
