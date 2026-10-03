import type { UserId } from "./user";

export type PaymentStatus = "pending" | "captured" | "failed" | "refunded";

export interface Payment {
  id: string;
  orderId: string;
  userId: UserId;
  amountCents: number;
  currency: string;
  status: PaymentStatus;
  providerReference: string | null;
  createdAt: Date;
}

const REFUND_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export function isRefundable(payment: Payment, now: Date = new Date()): boolean {
  const ageInDays = (now.getTime() - payment.createdAt.getTime()) / DAY_MS;
  return payment.status === "captured" && payment.providerReference !== null && ageInDays <= REFUND_WINDOW_DAYS;
}

export function formatAmount(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}
