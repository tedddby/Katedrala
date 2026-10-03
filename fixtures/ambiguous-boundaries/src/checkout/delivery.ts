import { estimateShipping } from "../cart/shipping-estimator";
import { normalizeAddress, type Address } from "./address";
import { rateCard, zoneFor } from "./shipping-rates";

export interface DeliveryOption {
  id: "standard" | "express";
  label: string;
  costCents: number;
  days: string;
}

const EXPRESS_SURCHARGE_CENTS = 990;

export function deliveryOptions(address: Address, weightGrams: number, merchandiseCents: number): DeliveryOption[] {
  const normalized = normalizeAddress(address);
  const standard = estimateShipping(normalized, weightGrams, merchandiseCents);
  const options: DeliveryOption[] = [
    {
      id: "standard",
      label: `${standard.carrier} (${standard.days} days)`,
      costCents: standard.costCents,
      days: standard.days,
    },
  ];
  if (zoneFor(normalized) === "domestic") {
    const card = rateCard("domestic");
    options.push({
      id: "express",
      label: `${card.carrier} Express (next day)`,
      costCents: standard.costCents + EXPRESS_SURCHARGE_CENTS,
      days: "1",
    });
  }
  return options;
}
