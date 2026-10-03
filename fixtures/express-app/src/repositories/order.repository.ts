import type { Pool } from "pg";
import type { NewOrder, Order, OrderItem, OrderStatus } from "../models/order.js";

interface OrderRow {
  id: string;
  user_id: string;
  status: OrderStatus;
  items: OrderItem[];
  total_cents: number;
  currency: string;
  charge_id: string | null;
  created_at: Date;
}

const ORDER_COLUMNS = "id, user_id, status, items, total_cents, currency, charge_id, created_at";

function toOrder(row: OrderRow): Order {
  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    items: row.items,
    totalCents: row.total_cents,
    currency: row.currency,
    chargeId: row.charge_id,
    createdAt: row.created_at,
  };
}

export class OrderRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<Order | undefined> {
    const result = await this.pool.query<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : toOrder(row);
  }

  async create(order: NewOrder): Promise<Order> {
    const result = await this.pool.query<OrderRow>(
      `INSERT INTO orders (user_id, status, items, total_cents, currency, charge_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${ORDER_COLUMNS}`,
      [order.userId, order.status, JSON.stringify(order.items), order.totalCents, order.currency, order.chargeId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("INSERT INTO orders returned no row");
    }
    return toOrder(row);
  }

  async updatePayment(id: string, status: OrderStatus, chargeId: string | null): Promise<void> {
    await this.pool.query("UPDATE orders SET status = $2, charge_id = $3, updated_at = now() WHERE id = $1", [
      id,
      status,
      chargeId,
    ]);
  }
}
