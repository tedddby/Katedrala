import { Pool } from "pg";
import { config } from "../config.js";
import { logger } from "../logger.js";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (error) => {
  logger.error("unexpected error on an idle PostgreSQL client", { error: error.message });
});

export async function closePool(): Promise<void> {
  await pool.end();
}
