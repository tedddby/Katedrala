export interface Coupon {
  code: string;
  percentOff?: number;
  amountOffCents?: number;
  minimumNetCents?: number;
  expiresAt?: string;
}

const COUPONS: readonly Coupon[] = [
  { code: "WELCOME10", percentOff: 10 },
  { code: "BREW5", amountOffCents: 500, minimumNetCents: 3000 },
  { code: "SUMMER24", percentOff: 15, expiresAt: "2024-09-01" },
];

export function findCoupon(code: string, now: Date = new Date()): Coupon | undefined {
  const coupon = COUPONS.find((candidate) => candidate.code === code.trim().toUpperCase());
  if (coupon?.expiresAt !== undefined && new Date(coupon.expiresAt) < now) {
    return undefined;
  }
  return coupon;
}

export function applyCoupon(netCents: number, coupon: Coupon | undefined): number {
  if (coupon === undefined || netCents < (coupon.minimumNetCents ?? 0)) return 0;
  const percent = coupon.percentOff === undefined ? 0 : Math.round((netCents * coupon.percentOff) / 100);
  return Math.min(netCents, percent + (coupon.amountOffCents ?? 0));
}

export function describeCoupon(coupon: Coupon): string {
  if (coupon.percentOff !== undefined) {
    return `${coupon.code}: ${coupon.percentOff}% off`;
  }
  return `${coupon.code}: ${((coupon.amountOffCents ?? 0) / 100).toFixed(2)} EUR off`;
}
