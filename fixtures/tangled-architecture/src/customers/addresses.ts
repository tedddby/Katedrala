import { nearestWarehouse, type Warehouse } from "../inventory/warehouses";

export interface Address {
  line1: string;
  city: string;
  postalCode: string;
  country: string;
}

export function normalizeAddress(address: Address): Address {
  return {
    ...address,
    postalCode: address.postalCode.replace(/\s+/g, "").toUpperCase(),
    country: address.country.trim().toUpperCase(),
  };
}

export function shippingOrigin(address: Address): Warehouse {
  return nearestWarehouse(normalizeAddress(address));
}

export function estimateDeliveryDays(address: Address): number {
  const destination = normalizeAddress(address);
  return shippingOrigin(destination).country === destination.country ? 2 : 5;
}
