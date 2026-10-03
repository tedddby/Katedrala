import type { Address } from "./address";

export type ShippingZone = "domestic" | "eu" | "world";

export interface RateCard {
  carrier: string;
  baseCents: number;
  perKgCents: number;
  days: string;
}

const EU = new Set(["AT", "BE", "DK", "ES", "FI", "FR", "IE", "IT", "LU", "NL", "PL", "PT", "SE"]);

const RATE_CARDS: Readonly<Record<ShippingZone, RateCard>> = {
  domestic: { carrier: "DHL Paket", baseCents: 490, perKgCents: 50, days: "1-2" },
  eu: { carrier: "DHL Europaket", baseCents: 1290, perKgCents: 150, days: "3-5" },
  world: { carrier: "DHL Express", baseCents: 2990, perKgCents: 600, days: "5-10" },
};

export function zoneFor(address: Address, homeCountry = "DE"): ShippingZone {
  if (address.country === homeCountry) return "domestic";
  return EU.has(address.country) ? "eu" : "world";
}

export function rateCard(zone: ShippingZone): RateCard {
  return RATE_CARDS[zone];
}

export function shippingCostCents(zone: ShippingZone, weightGrams: number): number {
  const card = RATE_CARDS[zone];
  return card.baseCents + Math.ceil(weightGrams / 1000) * card.perKgCents;
}

export function zoneLabel(zone: ShippingZone): string {
  return zone === "domestic" ? "Germany" : zone === "eu" ? "European Union" : "International";
}
