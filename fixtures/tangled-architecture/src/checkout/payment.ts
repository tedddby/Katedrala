import type { Customer } from "../customers/customer";
import type { PaymentIntent, RefundResponse } from "../generated/payment-provider";
import { publish } from "../lib/events";
import type { Cents } from "../lib/money";
import { findOrder, recordOrder } from "./order-history";

const PAYMENT_API = process.env.PAYMENT_API_URL ?? "https://payments.example.com/v2";

async function call<T>(path: string, body: Record<string, unknown>): Promise<T | undefined> {
  const response = await fetch(`${PAYMENT_API}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.PAYMENT_API_KEY ?? ""}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return response.ok ? ((await response.json()) as T) : undefined;
}

export async function chargeCustomer(customer: Customer, amountCents: Cents): Promise<boolean> {
  const intent = await call<PaymentIntent>("/intents", {
    amount: amountCents,
    currency: "usd",
    customer_email: customer.email,
  });
  return intent?.status === "succeeded";
}

export async function refundOrder(orderId: string): Promise<boolean> {
  const order = findOrder(orderId);
  if (order === undefined || order.status !== "paid") {
    return false;
  }
  const refund = await call<RefundResponse>("/refunds", { order_reference: order.id, amount: order.totalCents });
  if (refund?.status !== "succeeded") {
    return false;
  }
  recordOrder({ ...order, status: "refunded" });
  publish("order.refunded", { orderId: order.id, customerId: order.customerId });
  return true;
}
