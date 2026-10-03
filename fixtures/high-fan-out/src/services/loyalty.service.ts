import type { CrmAdapter } from "../adapters/crm.adapter";

export interface LoyaltyAward {
  awarded: number;
  balance: number;
}

export class LoyaltyService {
  constructor(
    private readonly crm: CrmAdapter,
    private readonly centsPerPoint = 100,
  ) {}

  pointsFor(totalCents: number): number {
    return Math.floor(totalCents / this.centsPerPoint);
  }

  async award(customerId: string, totalCents: number): Promise<LoyaltyAward> {
    const awarded = this.pointsFor(totalCents);
    if (awarded === 0) {
      const profile = await this.crm.profile(customerId);
      return { awarded, balance: profile.loyaltyPoints };
    }
    const balance = await this.crm.addLoyaltyPoints(customerId, awarded);
    return { awarded, balance };
  }
}
