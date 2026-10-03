export const SUPPORTED_CURRENCIES = ["usd", "eur", "gbp"] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];

/** Smallest amount the payment provider accepts for a charge, in minor units. */
export const MINIMUM_CHARGE_CENTS = 50;
