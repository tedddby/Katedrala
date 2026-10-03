import { roundTo } from "./math";

const SYMBOLS: Readonly<Record<string, string>> = {
  EUR: "\u20ac",
  GBP: "\u00a3",
  USD: "$",
};

export function formatCurrency(amount: number, currency: string): string {
  const fixed = roundTo(amount, 2).toFixed(2);
  const symbol = SYMBOLS[currency.toUpperCase()];
  return symbol === undefined ? `${fixed} ${currency.toUpperCase()}` : `${symbol}${fixed}`;
}
