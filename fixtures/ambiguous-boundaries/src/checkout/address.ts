export interface Address {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
}

export function normalizeAddress(input: Address): Address {
  return {
    name: input.name.trim(),
    street: input.street.trim(),
    postalCode: input.postalCode.replace(/\s+/g, "").toUpperCase(),
    city: input.city.trim(),
    country: input.country.trim().toUpperCase(),
  };
}

export function formatAddress(address: Address): string[] {
  return [address.name, address.street, `${address.postalCode} ${address.city}`, address.country];
}

export function isDomestic(address: Address, homeCountry = "DE"): boolean {
  return address.country === homeCountry;
}
