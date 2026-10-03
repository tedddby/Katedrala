import type { Queryable } from "@/shared/database";
import type { Order, OrderStatus } from "../models/order";
import type { OrderLine } from "../models/order-line";

type OrderRow = {
  id: string;
  customer_id: string;
  lines: OrderLine[];
  currency: string;
  status: OrderStatus;
  placed_at: Date | null;
};

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    customerId: row.customer_id,
    lines: row.lines,
    currency: row.currency,
    status: row.status,
    placedAt: row.placed_at,
  };
}

export class OrderRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: string): Promise<Order | undefined> {
    const [row] = await this.db.query<OrderRow>("SELECT * FROM orders WHERE id = $1", [id]);
    return row === undefined ? undefined : toOrder(row);
  }

  async findByCustomer(customerId: string): Promise<Order[]> {
    const rows = await this.db.query<OrderRow>(
      "SELECT * FROM orders WHERE customer_id = $1 ORDER BY placed_at DESC NULLS FIRST",
      [customerId],
    );
    return rows.map(toOrder);
  }

  async insert(order: Omit<Order, "id">): Promise<Order> {
    const [row] = await this.db.query<OrderRow>(
      `INSERT INTO orders (customer_id, lines, currency, status, placed_at)
       VALUES ($1, $2::jsonb, $3, $4, $5) RETURNING *`,
      [order.customerId, JSON.stringify(order.lines), order.currency, order.status, order.placedAt],
    );
    if (row === undefined) {
      throw new Error("INSERT INTO orders returned no row");
    }
    return toOrder(row);
  }

  async updateStatus(id: string, status: OrderStatus, placedAt?: Date): Promise<void> {
    await this.db.query("UPDATE orders SET status = $2, placed_at = COALESCE($3, placed_at) WHERE id = $1", [
      id,
      status,
      placedAt ?? null,
    ]);
  }
}
