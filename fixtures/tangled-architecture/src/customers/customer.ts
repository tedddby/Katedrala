import type { Order } from "../checkout/order";
import type { Address } from "./addresses";

export type LoyaltyTier = "bronze" | "silver" | "gold";

export interface Customer {
  id: string;
  email: string;
  name: string;
  tier: LoyaltyTier;
  shippingAddress?: Address;
  lastOrder?: Order;
}
