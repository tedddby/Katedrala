/** Base class for violations of business rules. Never contains transport or storage details. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = "not-found";

  constructor(entity: string, id: string) {
    super(`${entity} ${id} does not exist`);
  }
}

export class BookUnavailableError extends DomainError {
  readonly code = "book-unavailable";

  constructor(title: string) {
    super(`No copies of "${title}" are available`);
  }
}

export class LoanLimitReachedError extends DomainError {
  readonly code = "loan-limit-reached";

  constructor(memberId: string, limit: number) {
    super(`Member ${memberId} already has ${limit} books on loan`);
  }
}

export class LoanAlreadyClosedError extends DomainError {
  readonly code = "loan-already-closed";

  constructor(loanId: string) {
    super(`Loan ${loanId} has already been returned`);
  }
}
