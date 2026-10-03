import { config } from "../config.js";
import { UpstreamError } from "../errors.js";

export interface ShippingQuote {
  carrier: string;
  amountCents: number;
  deliveryDays: number;
}

interface RateEstimate {
  carrier_friendly_name: string;
  shipping_amount: { amount: number; currency: string };
  delivery_days: number | null;
}

const WAREHOUSE = { countryCode: "DE", postalCode: "10115", city: "Berlin" };

/** Cheapest carrier rate for a parcel leaving the warehouse, from the ShipEngine rate estimate API. */
export async function quoteShipping(destinationCountry: string, weightGrams: number): Promise<ShippingQuote> {
  const response = await fetch("https://api.shipengine.com/v1/rates/estimate", {
    method: "POST",
    headers: {
      "API-Key": config.shipEngineApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from_country_code: WAREHOUSE.countryCode,
      from_postal_code: WAREHOUSE.postalCode,
      from_city_locality: WAREHOUSE.city,
      to_country_code: destinationCountry,
      weight: { value: weightGrams, unit: "gram" },
    }),
  });
  if (!response.ok) {
    throw new UpstreamError("ShipEngine", response.status);
  }
  const rates = (await response.json()) as RateEstimate[];
  let cheapest: RateEstimate | undefined;
  for (const rate of rates) {
    if (cheapest === undefined || rate.shipping_amount.amount < cheapest.shipping_amount.amount) {
      cheapest = rate;
    }
  }
  if (cheapest === undefined) {
    throw new UpstreamError("ShipEngine", 404);
  }
  return {
    carrier: cheapest.carrier_friendly_name,
    amountCents: Math.round(cheapest.shipping_amount.amount * 100),
    deliveryDays: cheapest.delivery_days ?? 7,
  };
}
