import data from "./data.json";
import type { Currency } from "@/utils/money";

export interface Settings {
  readonly shopName: string;
  readonly country: string;
  readonly currency: Currency;
  readonly supportedCountries: readonly string[];
}

export const settings: Settings = {
  shopName: data.shopName,
  country: data.defaultCountry,
  currency: data.currency as Currency,
  supportedCountries: data.countries,
};

export function isSupportedCountry(country: string): boolean {
  return settings.supportedCountries.includes(country.toUpperCase());
}
