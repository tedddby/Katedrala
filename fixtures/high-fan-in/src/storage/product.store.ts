import { createLogger } from "../core/logger";
import type { Database } from "./database";

const log = createLogger("storage.products");

export interface Product {
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
}

export class ProductStore {
  constructor(private readonly db: Database) {}

  async findBySku(sku: string): Promise<Product | undefined> {
    const rows = await this.db.query<Product>(
      'SELECT sku, name, price_cents AS "priceCents", stock FROM products WHERE sku = $1',
      [sku],
    );
    return rows[0];
  }

  async updateStock(sku: string, stock: number): Promise<void> {
    await this.db.query("UPDATE products SET stock = $2 WHERE sku = $1", [sku, stock]);
    log.debug("stock updated", { sku, stock });
  }

  async listAll(): Promise<Product[]> {
    return this.db.query<Product>('SELECT sku, name, price_cents AS "priceCents", stock FROM products ORDER BY sku');
  }
}
