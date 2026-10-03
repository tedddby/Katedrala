import type { Pool } from "pg";
import type { CreateUserInput, User, UserRole } from "../models/user.js";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: Date;
}

const USER_COLUMNS = "id, email, name, role, created_at";

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, name: row.name, role: row.role, createdAt: row.created_at };
}

export class UserRepository {
  constructor(private readonly pool: Pool) {}

  async findById(id: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    const row = result.rows[0];
    return row === undefined ? undefined : toUser(row);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await this.pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
    const row = result.rows[0];
    return row === undefined ? undefined : toUser(row);
  }

  async insert(input: CreateUserInput): Promise<User> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (email, name, role) VALUES ($1, $2, 'customer') RETURNING ${USER_COLUMNS}`,
      [input.email, input.name],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error("INSERT INTO users returned no row");
    }
    return toUser(row);
  }
}
