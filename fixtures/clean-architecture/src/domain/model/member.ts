import { LoanLimitReachedError } from "./errors.js";

export type MemberId = string;

export type MembershipTier = "standard" | "premium";

const LOAN_LIMITS: Record<MembershipTier, number> = {
  standard: 3,
  premium: 10,
};

export class Member {
  constructor(
    readonly id: MemberId,
    readonly name: string,
    readonly email: string,
    readonly tier: MembershipTier,
  ) {}

  get loanLimit(): number {
    return LOAN_LIMITS[this.tier];
  }

  assertCanBorrow(openLoans: number): void {
    if (openLoans >= this.loanLimit) {
      throw new LoanLimitReachedError(this.id, this.loanLimit);
    }
  }
}
