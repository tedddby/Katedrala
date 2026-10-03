import { recentOrders } from "../checkout/order-history";
import type { LoyaltyTier } from "./customer";

const DISCOUNT_PERCENT: Record<LoyaltyTier, number> = { bronze: 0, silver: 5, gold: 10 };
const YEAR_MS = 365 * 86_400_000;

export function discountFor(tier: LoyaltyTier): number {
  return DISCOUNT_PERCENT[tier];
}

export function tierFor(customerId: string, now = new Date()): LoyaltyTier {
  const spentCents = recentOrders(customerId, new Date(now.getTime() - YEAR_MS))
    .filter((order) => order.status === "paid")
    .reduce((sum, order) => sum + order.totalCents, 0);
  if (spentCents >= 100_000) {
    return "gold";
  }
  return spentCents >= 25_000 ? "silver" : "bronze";
}

export function pointsFor(totalCents: number, tier: LoyaltyTier): number {
  return Math.floor(totalCents / 100) * (tier === "gold" ? 2 : 1);
}
