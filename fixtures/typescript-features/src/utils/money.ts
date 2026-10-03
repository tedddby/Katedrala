export type Currency = "EUR" | "USD" | "GBP";

export interface Money {
  readonly amountCents: number;
  readonly currency: Currency;
}

const SYMBOLS: Readonly<Record<Currency, string>> = { EUR: "\u20ac", USD: "$", GBP: "\u00a3" };

export function money(amountCents: number, currency: Currency = "EUR"): Money {
  return { amountCents: Math.round(amountCents), currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new RangeError(`Cannot add ${a.currency} to ${b.currency}`);
  }
  return money(a.amountCents + b.amountCents, a.currency);
}

export function formatMoney(value: Money): string;
export function formatMoney(amountCents: number, currency?: Currency): string;
export function formatMoney(value: Money | number, currency: Currency = "EUR"): string {
  const { amountCents, currency: code } = typeof value === "number" ? money(value, currency) : value;
  const sign = amountCents < 0 ? "-" : "";
  return `${sign}${SYMBOLS[code]}${(Math.abs(amountCents) / 100).toFixed(2)}`;
}
