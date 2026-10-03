import { createLogger } from "../core/logger";
import type { Database } from "./database";

const log = createLogger("storage.users");

const COLUMNS = 'id, email, name, created_at AS "createdAt", last_seen_at AS "lastSeenAt"';

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  lastSeenAt: Date | null;
}

export class UserStore {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<User | undefined> {
    const rows = await this.db.query<User>(`SELECT ${COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0];
  }

  async insert(user: User): Promise<void> {
    await this.db.query("INSERT INTO users (id, email, name, created_at) VALUES ($1, $2, $3, $4)", [
      user.id,
      user.email,
      user.name,
      user.createdAt,
    ]);
    log.info("user inserted", { id: user.id });
  }

  async listInactiveSince(since: Date): Promise<User[]> {
    const rows = await this.db.query<User>(`SELECT ${COLUMNS} FROM users WHERE last_seen_at < $1`, [since]);
    log.debug("inactive users loaded", { count: rows.length });
    return rows;
  }
}
