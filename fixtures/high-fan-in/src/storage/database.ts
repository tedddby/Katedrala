import { Pool } from "pg";
import { createLogger } from "../core/logger";

const log = createLogger("storage.database");

export interface Database {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export async function connectDatabase(url: string): Promise<Database> {
  const pool = new Pool({ connectionString: url, max: 10 });
  pool.on("error", (error) => log.error("idle client failed", error));
  await pool.query("SELECT 1");
  log.info("connected", { host: new URL(url).host });

  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const started = performance.now();
      const result = await pool.query(sql, params);
      log.debug("query", { sql, rows: result.rowCount, ms: Math.round(performance.now() - started) });
      return result.rows as T[];
    },
    async close(): Promise<void> {
      await pool.end();
      log.info("pool closed");
    },
  };
}
