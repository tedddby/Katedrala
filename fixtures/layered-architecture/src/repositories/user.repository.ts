import type { Queryable } from "@/shared/database";
import type { NewUser, User } from "../models/user";

type UserRow = {
  id: string;
  email: string;
  name: string;
  billing_country: string;
  created_at: Date;
};

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    billingCountry: row.billing_country,
    createdAt: row.created_at,
  };
}

export class UserRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.query<UserRow>("SELECT * FROM users WHERE id = $1", [id]);
    return row === undefined ? undefined : toUser(row);
  }

  async findByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.db.query<UserRow>("SELECT * FROM users WHERE email = $1", [email]);
    return row === undefined ? undefined : toUser(row);
  }

  async insert(user: NewUser): Promise<User> {
    const [row] = await this.db.query<UserRow>(
      "INSERT INTO users (email, name, billing_country) VALUES ($1, $2, $3) RETURNING *",
      [user.email, user.name, user.billingCountry],
    );
    if (row === undefined) {
      throw new Error("INSERT INTO users returned no row");
    }
    return toUser(row);
  }
}
