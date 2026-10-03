import {
  Loan,
  NotFoundError,
  type BookRepository,
  type Clock,
  type LoanRepository,
  type MemberRepository,
  type Notifier,
} from "../domain/index.js";
import { toLoanDto, type LoanDto } from "./dto.js";

export interface BorrowBookCommand {
  memberId: string;
  bookId: string;
}

export class BorrowBook {
  constructor(
    private readonly books: BookRepository,
    private readonly members: MemberRepository,
    private readonly loans: LoanRepository,
    private readonly notifier: Notifier,
    private readonly clock: Clock,
  ) {}

  async execute(command: BorrowBookCommand): Promise<LoanDto> {
    const member = await this.members.findById(command.memberId);
    if (member === null) {
      throw new NotFoundError("Member", command.memberId);
    }
    const book = await this.books.findById(command.bookId);
    if (book === null) {
      throw new NotFoundError("Book", command.bookId);
    }

    const openLoans = await this.loans.findOpenByMember(member.id);
    member.assertCanBorrow(openLoans.length);
    book.checkOut();

    const loan = Loan.open(this.loans.nextId(), book.id, member.id, this.clock.now());
    await this.books.save(book);
    await this.loans.save(loan);
    await this.notifier.loanConfirmed(member, loan, book.title);
    return toLoanDto(loan);
  }
}
