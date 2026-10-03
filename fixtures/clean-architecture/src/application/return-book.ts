import { NotFoundError, type BookRepository, type Clock, type LoanRepository } from "../domain/index.js";
import { toLoanDto, type LoanDto } from "./dto.js";

export class ReturnBook {
  constructor(
    private readonly books: BookRepository,
    private readonly loans: LoanRepository,
    private readonly clock: Clock,
  ) {}

  async execute(loanId: string): Promise<LoanDto> {
    const loan = await this.loans.findById(loanId);
    if (loan === null) {
      throw new NotFoundError("Loan", loanId);
    }
    const book = await this.books.findById(loan.bookId);
    if (book === null) {
      throw new NotFoundError("Book", loan.bookId);
    }

    loan.close(this.clock.now());
    book.checkIn();
    await this.loans.save(loan);
    await this.books.save(book);
    return toLoanDto(loan);
  }
}
