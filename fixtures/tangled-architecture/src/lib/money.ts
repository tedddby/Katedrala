export type Cents = number;

export function toCents(amount: number): Cents {
  return Math.round(amount * 100);
}

export function formatCents(cents: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function applyDiscount(cents: Cents, percent: number): Cents {
  return Math.round(cents * (1 - percent / 100));
}
