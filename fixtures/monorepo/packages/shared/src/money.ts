export interface Money {
  /** Amount in the currency's minor unit (cents). */
  amountCents: number;
  /** ISO 4217 currency code. */
  currency: string;
}

export function money(amountCents: number, currency = "USD"): Money {
  if (!Number.isInteger(amountCents)) {
    throw new RangeError(`Money amounts are whole cents, got ${amountCents}`);
  }
  return { amountCents, currency };
}

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new TypeError(`Cannot add ${a.currency} to ${b.currency}`);
  }
  return money(a.amountCents + b.amountCents, a.currency);
}

export function multiplyMoney(value: Money, factor: number): Money {
  return money(Math.round(value.amountCents * factor), value.currency);
}

export function formatMoney(value: Money, locale = "en-US"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: value.currency }).format(value.amountCents / 100);
}
