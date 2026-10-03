import nodemailer, { type Transporter } from "nodemailer";
import type { Loan } from "../../domain/model/loan.js";
import type { Member } from "../../domain/model/member.js";
import type { Notifier } from "../../domain/ports/notifier.js";

export interface SmtpSettings {
  host: string;
  port: number;
  from: string;
}

export class SmtpNotifier implements Notifier {
  private readonly transport: Transporter;

  constructor(private readonly settings: SmtpSettings) {
    this.transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
    });
  }

  async loanConfirmed(member: Member, loan: Loan, bookTitle: string): Promise<void> {
    await this.transport.sendMail({
      from: this.settings.from,
      to: member.email,
      subject: `You borrowed "${bookTitle}"`,
      text: `Hi ${member.name},\n\nplease return "${bookTitle}" by ${loan.dueAt.toDateString()}.\n`,
    });
  }

  async overdueReminder(member: Member, loans: Loan[]): Promise<void> {
    const lines = loans.map((loan) => `- loan ${loan.id}, due ${loan.dueAt.toDateString()}`);
    await this.transport.sendMail({
      from: this.settings.from,
      to: member.email,
      subject: `You have ${loans.length} overdue book(s)`,
      text: [`Hi ${member.name},`, "", "the following loans are overdue:", ...lines].join("\n"),
    });
  }
}
