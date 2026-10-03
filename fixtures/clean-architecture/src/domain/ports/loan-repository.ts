import type { Loan, LoanId } from "../model/loan.js";
import type { MemberId } from "../model/member.js";

export interface LoanRepository {
  nextId(): LoanId;
  findById(id: LoanId): Promise<Loan | null>;
  findOpenByMember(memberId: MemberId): Promise<Loan[]>;
  findOverdue(now: Date): Promise<Loan[]>;
  save(loan: Loan): Promise<void>;
}
