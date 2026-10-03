import type { Book, BookId } from "../model/book.js";

export interface BookRepository {
  findById(id: BookId): Promise<Book | null>;
  save(book: Book): Promise<void>;
}
