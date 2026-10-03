import type { Clock, Loan, LoanRepository, MemberRepository, Notifier } from "../domain/index.js";

export interface OverdueReport {
  overdueLoans: number;
  membersNotified: number;
}

export class SendOverdueReminders {
  constructor(
    private readonly loans: LoanRepository,
    private readonly members: MemberRepository,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<OverdueReport> {
    const overdue = await this.loans.findOverdue(this.clock.now());

    const byMember = new Map<string, Loan[]>();
    for (const loan of overdue) {
      byMember.set(loan.memberId, [...(byMember.get(loan.memberId) ?? []), loan]);
    }

    let membersNotified = 0;
    for (const [memberId, loans] of byMember) {
      const member = await this.members.findById(memberId);
      if (member === null) {
        continue;
      }
      await this.notifier.overdueReminder(member, loans);
      membersNotified += 1;
    }
    return { overdueLoans: overdue.length, membersNotified };
  }
}
