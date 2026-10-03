const VAT_RATES: Readonly<Record<string, number>> = {
  AT: 0.2,
  BE: 0.21,
  DE: 0.19,
  ES: 0.21,
  FR: 0.2,
  IT: 0.22,
  NL: 0.21,
};

export interface TaxAssessment {
  rate: number;
  amountCents: number;
}

export class TaxService {
  constructor(private readonly defaultRate = 0.19) {}

  rateFor(country: string): number {
    return VAT_RATES[country.toUpperCase()] ?? this.defaultRate;
  }

  compute(netCents: number, country: string): TaxAssessment {
    const rate = this.rateFor(country);
    return { rate, amountCents: Math.round(netCents * rate) };
  }
}
