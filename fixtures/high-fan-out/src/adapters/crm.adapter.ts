import { HttpClient } from "./http-client";

export type CustomerTier = "standard" | "silver" | "gold";

export interface CustomerProfile {
  id: string;
  tier: CustomerTier;
  loyaltyPoints: number;
}

export interface CouponRedemption {
  valid: boolean;
  percentOff: number;
}

export class CrmAdapter {
  private readonly http: HttpClient;

  constructor(baseUrl: string) {
    this.http = new HttpClient({ baseUrl });
  }

  async profile(customerId: string): Promise<CustomerProfile> {
    return this.http.get<CustomerProfile>(`/customers/${customerId}`);
  }

  async addLoyaltyPoints(customerId: string, points: number): Promise<number> {
    const result = await this.http.post<{ balance: number }>(`/customers/${customerId}/points`, { points });
    return result.balance;
  }

  async redeemCoupon(code: string, customerId: string): Promise<CouponRedemption> {
    return this.http.post<CouponRedemption>(`/coupons/${encodeURIComponent(code)}/redeem`, { customerId });
  }
}
