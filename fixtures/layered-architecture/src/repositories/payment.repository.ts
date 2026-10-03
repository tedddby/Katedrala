import type { Queryable } from "@/shared/database";
import type { Payment, PaymentStatus } from "../models/payment";

type PaymentRow = {
  id: string;
  order_id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  status: PaymentStatus;
  provider_reference: string | null;
  created_at: Date;
};

function toPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    orderId: row.order_id,
    userId: row.user_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    providerReference: row.provider_reference,
    createdAt: row.created_at,
  };
}

export class PaymentRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: string): Promise<Payment | undefined> {
    const [row] = await this.db.query<PaymentRow>("SELECT * FROM payments WHERE id = $1", [id]);
    return row === undefined ? undefined : toPayment(row);
  }

  async findByOrder(orderId: string): Promise<Payment[]> {
    const rows = await this.db.query<PaymentRow>(
      "SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at",
      [orderId],
    );
    return rows.map(toPayment);
  }

  async insert(payment: Omit<Payment, "id" | "createdAt">): Promise<Payment> {
    const [row] = await this.db.query<PaymentRow>(
      `INSERT INTO payments (order_id, user_id, amount_cents, currency, status, provider_reference)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [payment.orderId, payment.userId, payment.amountCents, payment.currency, payment.status, payment.providerReference],
    );
    if (row === undefined) {
      throw new Error("INSERT INTO payments returned no row");
    }
    return toPayment(row);
  }

  async updateStatus(id: string, status: PaymentStatus, providerReference?: string): Promise<void> {
    await this.db.query(
      "UPDATE payments SET status = $2, provider_reference = COALESCE($3, provider_reference) WHERE id = $1",
      [id, status, providerReference ?? null],
    );
  }
}
