export enum CustomerTier {
  Standard = "standard",
  Gold = "gold",
}

export interface Customer {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly tier: CustomerTier;
}

export function customerDisplayName(customer: Customer): string {
  return customer.tier === CustomerTier.Gold ? `${customer.name} (Gold)` : customer.name;
}
