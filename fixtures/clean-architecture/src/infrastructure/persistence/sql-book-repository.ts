import { Book, type BookId } from "../../domain/model/book.js";
import type { BookRepository } from "../../domain/ports/book-repository.js";
import type { SqlPool } from "./pool.js";

type BookRow = {
  id: string;
  isbn: string;
  title: string;
  available_copies: number;
};

export class SqlBookRepository implements BookRepository {
  constructor(private readonly pool: SqlPool) {}

  async findById(id: BookId): Promise<Book | null> {
    const result = await this.pool.query<BookRow>(
      "SELECT id, isbn, title, available_copies FROM books WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : new Book(row.id, row.isbn, row.title, row.available_copies);
  }

  async save(book: Book): Promise<void> {
    await this.pool.query("UPDATE books SET available_copies = $2 WHERE id = $1", [book.id, book.copiesAvailable]);
  }
}
