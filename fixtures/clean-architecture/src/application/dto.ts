import type { Loan } from "../domain/index.js";

/** Transport-agnostic representation of a loan returned by use cases. */
export interface LoanDto {
  id: string;
  bookId: string;
  memberId: string;
  borrowedAt: string;
  dueAt: string;
  returnedAt: string | null;
}

export function toLoanDto(loan: Loan): LoanDto {
  return {
    id: loan.id,
    bookId: loan.bookId,
    memberId: loan.memberId,
    borrowedAt: loan.borrowedAt.toISOString(),
    dueAt: loan.dueAt.toISOString(),
    returnedAt: loan.returnedAt?.toISOString() ?? null,
  };
}
