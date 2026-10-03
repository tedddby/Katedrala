export namespace Tax {
  export const DEFAULT_RATE = 0.19;

  export namespace EU {
    export const rates: Readonly<Record<string, number>> = { AT: 0.2, DE: 0.19, FR: 0.2, IE: 0.23, NL: 0.21 };

    export function vatFor(country: string): number {
      return rates[country] ?? DEFAULT_RATE;
    }
  }

  export namespace US {
    const stateRates: Readonly<Record<string, number>> = { CA: 0.0725, NY: 0.04, TX: 0.0625 };

    export function salesTaxFor(state: string): number {
      return stateRates[state] ?? 0;
    }
  }

  export function rateFor(country: string, region?: string): number {
    return country === "US" ? US.salesTaxFor(region ?? "") : EU.vatFor(country);
  }
}
