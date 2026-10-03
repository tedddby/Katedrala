import { BookUnavailableError } from "./errors.js";

export type BookId = string;

export class Book {
  constructor(
    readonly id: BookId,
    readonly isbn: string,
    readonly title: string,
    private availableCopies: number,
  ) {
    if (!Number.isInteger(availableCopies) || availableCopies < 0) {
      throw new RangeError(`Invalid number of copies for "${title}": ${availableCopies}`);
    }
  }

  get copiesAvailable(): number {
    return this.availableCopies;
  }

  get isAvailable(): boolean {
    return this.availableCopies > 0;
  }

  checkOut(): void {
    if (!this.isAvailable) {
      throw new BookUnavailableError(this.title);
    }
    this.availableCopies -= 1;
  }

  checkIn(): void {
    this.availableCopies += 1;
  }
}
