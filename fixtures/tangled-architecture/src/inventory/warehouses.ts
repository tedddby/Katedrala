import type { Address } from "../customers/addresses";

export interface Warehouse {
  id: string;
  name: string;
  country: string;
  postalPrefix: string;
}

export const DEFAULT_WAREHOUSE: Warehouse = { id: "wh-ber", name: "Berlin", country: "DE", postalPrefix: "1" };

export const WAREHOUSES: readonly Warehouse[] = [
  DEFAULT_WAREHOUSE,
  { id: "wh-muc", name: "Munich", country: "DE", postalPrefix: "8" },
  { id: "wh-rtm", name: "Rotterdam", country: "NL", postalPrefix: "3" },
];

export function nearestWarehouse(address: Address): Warehouse {
  const sameCountry = WAREHOUSES.filter((warehouse) => warehouse.country === address.country);
  const candidates = sameCountry.length > 0 ? sameCountry : WAREHOUSES;
  return (
    candidates.find((warehouse) => address.postalCode.startsWith(warehouse.postalPrefix)) ??
    candidates[0] ??
    DEFAULT_WAREHOUSE
  );
}
