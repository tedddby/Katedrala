export type TaxCategory = "standard" | "reduced";

type RateTable = Readonly<Record<TaxCategory, number>>;

const EU_COUNTRIES = new Set(["AT", "BE", "DE", "DK", "ES", "FI", "FR", "IE", "IT", "LU", "NL", "PL", "PT", "SE"]);

const DEFAULT_RATES: RateTable = { standard: 0.19, reduced: 0.07 };

const VAT_RATES: Readonly<Record<string, RateTable>> = {
  DE: DEFAULT_RATES,
  AT: { standard: 0.2, reduced: 0.1 },
  FR: { standard: 0.2, reduced: 0.055 },
  NL: { standard: 0.21, reduced: 0.09 },
};

export function isTaxExempt(country: string): boolean {
  return !EU_COUNTRIES.has(country);
}

export function vatRate(country: string, category: TaxCategory = "standard"): number {
  if (isTaxExempt(country)) return 0;
  return (VAT_RATES[country] ?? DEFAULT_RATES)[category];
}
