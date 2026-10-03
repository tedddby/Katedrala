/**
 * Legacy money formatter, kept for consumers that still load this package with `require()`.
 * Written in TypeScript's CommonJS style (`export =`); the function and the namespace merge.
 */
function legacyFormat(amountCents: number, currency: string = legacyFormat.defaultCurrency): string {
  const symbol = legacyFormat.symbols[currency] ?? `${currency} `;
  return `${symbol}${(amountCents / 100).toFixed(2)}`;
}

namespace legacyFormat {
  export const defaultCurrency = "EUR";
  export const symbols: Readonly<Record<string, string>> = { EUR: "\u20ac", GBP: "\u00a3", USD: "$" };

  export function parse(text: string): number {
    const amount = Number.parseFloat(text.replace(/[^\d.-]/g, ""));
    if (Number.isNaN(amount)) {
      throw new Error(`Cannot parse an amount from "${text}"`);
    }
    return Math.round(amount * 100);
  }
}

export = legacyFormat;
