import { randomUUID } from "node:crypto";
import { Loan, type LoanId } from "../../domain/model/loan.js";
import type { MemberId } from "../../domain/model/member.js";
import type { LoanRepository } from "../../domain/ports/loan-repository.js";
import type { SqlPool } from "./pool.js";

type LoanRow = {
  id: string;
  book_id: string;
  member_id: string;
  borrowed_at: Date;
  due_at: Date;
  returned_at: Date | null;
};

const COLUMNS = "id, book_id, member_id, borrowed_at, due_at, returned_at";

function toLoan(row: LoanRow): Loan {
  return Loan.restore({
    id: row.id,
    bookId: row.book_id,
    memberId: row.member_id,
    borrowedAt: row.borrowed_at,
    dueAt: row.due_at,
    returnedAt: row.returned_at,
  });
}

export class SqlLoanRepository implements LoanRepository {
  constructor(private readonly pool: SqlPool) {}

  nextId(): LoanId {
    return randomUUID();
  }

  async findById(id: LoanId): Promise<Loan | null> {
    const result = await this.pool.query<LoanRow>(`SELECT ${COLUMNS} FROM loans WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row === undefined ? null : toLoan(row);
  }

  async findOpenByMember(memberId: MemberId): Promise<Loan[]> {
    const result = await this.pool.query<LoanRow>(
      `SELECT ${COLUMNS} FROM loans WHERE member_id = $1 AND returned_at IS NULL`,
      [memberId],
    );
    return result.rows.map(toLoan);
  }

  async findOverdue(now: Date): Promise<Loan[]> {
    const result = await this.pool.query<LoanRow>(
      `SELECT ${COLUMNS} FROM loans WHERE returned_at IS NULL AND due_at < $1 ORDER BY due_at`,
      [now],
    );
    return result.rows.map(toLoan);
  }

  async save(loan: Loan): Promise<void> {
    const s = loan.toSnapshot();
    await this.pool.query(
      `INSERT INTO loans (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET returned_at = EXCLUDED.returned_at`,
      [s.id, s.bookId, s.memberId, s.borrowedAt, s.dueAt, s.returnedAt],
    );
  }
}
