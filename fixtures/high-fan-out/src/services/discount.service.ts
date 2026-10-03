import type { CrmAdapter, CustomerTier } from "../adapters/crm.adapter";

const TIER_PERCENT: Record<CustomerTier, number> = { standard: 0, silver: 3, gold: 5 };

export interface Discount {
  amountCents: number;
  reasons: string[];
}

export class DiscountService {
  constructor(
    private readonly crm: CrmAdapter,
    private readonly maxPercent = 30,
  ) {}

  async discountFor(customerId: string, subtotalCents: number, couponCode?: string): Promise<Discount> {
    const profile = await this.crm.profile(customerId);
    let percent = TIER_PERCENT[profile.tier];
    const reasons = percent > 0 ? [`${profile.tier} tier`] : [];
    if (couponCode !== undefined) {
      const coupon = await this.crm.redeemCoupon(couponCode, customerId);
      if (coupon.valid) {
        percent += coupon.percentOff;
        reasons.push(`coupon ${couponCode}`);
      }
    }
    percent = Math.min(percent, this.maxPercent);
    return { amountCents: Math.round((subtotalCents * percent) / 100), reasons };
  }
}
