import type { Order, OrderLine, OrderStatus } from "../domain/order";
import type { Database } from "./database";

interface OrderRow {
  id: string;
  customer_id: string;
  lines: OrderLine[];
  status: OrderStatus;
  payment_id: string | null;
  created_at: Date;
}

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    lines: row.lines,
    status: row.status,
    paymentId: row.payment_id ?? undefined,
    createdAt: row.created_at,
  };
}

export class OrderRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<Order | undefined> {
    const rows = await this.db.query<OrderRow>("SELECT * FROM orders WHERE id = $1", [id]);
    return rows.length > 0 ? toOrder(rows[0]) : undefined;
  }

  async findByCustomer(customerId: string): Promise<Order[]> {
    const rows = await this.db.query<OrderRow>(
      "SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC",
      [customerId],
    );
    return rows.map(toOrder);
  }

  async save(order: Order): Promise<void> {
    await this.db.query(
      `INSERT INTO orders (id, customer_id, lines, status, payment_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, payment_id = EXCLUDED.payment_id`,
      [
        order.id,
        order.customerId,
        JSON.stringify(order.lines),
        order.status,
        order.paymentId ?? null,
        order.createdAt,
      ],
    );
  }
}
