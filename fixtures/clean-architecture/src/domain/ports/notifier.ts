import type { Loan } from "../model/loan.js";
import type { Member } from "../model/member.js";

export interface Notifier {
  loanConfirmed(member: Member, loan: Loan, bookTitle: string): Promise<void>;
  overdueReminder(member: Member, loans: Loan[]): Promise<void>;
}
