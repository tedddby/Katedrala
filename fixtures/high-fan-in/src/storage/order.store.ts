import { createLogger } from "../core/logger";
import type { Database } from "./database";

const log = createLogger("storage.orders");

const COLUMNS =
  'id, user_id AS "userId", sku, quantity, total_cents AS "totalCents", state, created_at AS "createdAt"';

export type OrderState = "open" | "paid" | "shipped" | "cancelled";

export interface OrderRecord {
  id: string;
  userId: string;
  sku: string;
  quantity: number;
  totalCents: number;
  state: OrderState;
  createdAt: Date;
}

export class OrderStore {
  constructor(private readonly db: Database) {}

  async insert(order: OrderRecord): Promise<void> {
    await this.db.query(
      "INSERT INTO orders (id, user_id, sku, quantity, total_cents, state, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
      [order.id, order.userId, order.sku, order.quantity, order.totalCents, order.state, order.createdAt],
    );
    log.info("order inserted", { id: order.id, totalCents: order.totalCents });
  }

  async updateState(id: string, state: OrderState): Promise<void> {
    await this.db.query("UPDATE orders SET state = $2 WHERE id = $1", [id, state]);
    log.info("order state changed", { id, state });
  }

  async findById(id: string): Promise<OrderRecord | undefined> {
    const rows = await this.db.query<OrderRecord>(`SELECT ${COLUMNS} FROM orders WHERE id = $1`, [id]);
    return rows[0];
  }

  async listCreatedBetween(from: Date, to: Date): Promise<OrderRecord[]> {
    return this.db.query<OrderRecord>(`SELECT ${COLUMNS} FROM orders WHERE created_at >= $1 AND created_at < $2`, [
      from,
      to,
    ]);
  }

  async listOpenOlderThan(cutoff: Date): Promise<OrderRecord[]> {
    return this.db.query<OrderRecord>(`SELECT ${COLUMNS} FROM orders WHERE state = 'open' AND created_at < $1`, [
      cutoff,
    ]);
  }
}
