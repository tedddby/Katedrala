import pg from "pg";

export type SqlPool = pg.Pool;

export function createPool(connectionString: string): SqlPool {
  return new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 10_000 });
}
