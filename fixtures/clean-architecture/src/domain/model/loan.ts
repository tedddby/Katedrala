import type { BookId } from "./book.js";
import { LoanAlreadyClosedError } from "./errors.js";
import type { MemberId } from "./member.js";

export type LoanId = string;

export interface LoanSnapshot {
  id: LoanId;
  bookId: BookId;
  memberId: MemberId;
  borrowedAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
}

const LOAN_PERIOD_DAYS = 21;
const DAY_MS = 86_400_000;

export class Loan {
  private constructor(private readonly state: LoanSnapshot) {}

  static open(id: LoanId, bookId: BookId, memberId: MemberId, borrowedAt: Date): Loan {
    const dueAt = new Date(borrowedAt.getTime() + LOAN_PERIOD_DAYS * DAY_MS);
    return new Loan({ id, bookId, memberId, borrowedAt, dueAt, returnedAt: null });
  }

  static restore(snapshot: LoanSnapshot): Loan {
    return new Loan({ ...snapshot });
  }

  get id(): LoanId {
    return this.state.id;
  }

  get bookId(): BookId {
    return this.state.bookId;
  }

  get memberId(): MemberId {
    return this.state.memberId;
  }

  get borrowedAt(): Date {
    return this.state.borrowedAt;
  }

  get dueAt(): Date {
    return this.state.dueAt;
  }

  get returnedAt(): Date | null {
    return this.state.returnedAt;
  }

  get isOpen(): boolean {
    return this.state.returnedAt === null;
  }

  isOverdue(now: Date): boolean {
    return this.isOpen && now.getTime() > this.state.dueAt.getTime();
  }

  daysOverdue(now: Date): number {
    return this.isOverdue(now) ? Math.ceil((now.getTime() - this.state.dueAt.getTime()) / DAY_MS) : 0;
  }

  close(returnedAt: Date): void {
    if (!this.isOpen) {
      throw new LoanAlreadyClosedError(this.state.id);
    }
    this.state.returnedAt = returnedAt;
  }

  toSnapshot(): LoanSnapshot {
    return { ...this.state };
  }
}
