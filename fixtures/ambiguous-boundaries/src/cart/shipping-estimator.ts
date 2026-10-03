import { normalizeAddress, type Address } from "../checkout/address";
import { rateCard, shippingCostCents, zoneFor, type ShippingZone } from "../checkout/shipping-rates";

export interface ShippingEstimate {
  zone: ShippingZone;
  carrier: string;
  costCents: number;
  days: string;
}

export const FREE_SHIPPING_FROM_CENTS = 4900;

export function estimateShipping(address: Address, weightGrams: number, merchandiseCents = 0): ShippingEstimate {
  const zone = zoneFor(normalizeAddress(address));
  const card = rateCard(zone);
  const free = zone === "domestic" && merchandiseCents >= FREE_SHIPPING_FROM_CENTS;
  return { zone, carrier: card.carrier, costCents: free ? 0 : shippingCostCents(zone, weightGrams), days: card.days };
}
