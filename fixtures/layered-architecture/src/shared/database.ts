import pg from "pg";

export type Row = Record<string, unknown>;

/** The part of a database connection that repositories need; implemented by the pool and by transactions. */
export interface Queryable {
  query<T extends Row>(sql: string, params?: unknown[]): Promise<T[]>;
}

export class Database implements Queryable {
  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString, max: 10 });
  }

  async query<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }

  async transaction<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const tx: Queryable = {
      query: async <R extends Row>(sql: string, params: unknown[] = []) => (await client.query<R>(sql, params)).rows,
    };
    try {
      await client.query("BEGIN");
      const result = await work(tx);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
