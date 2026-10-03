import type { Customer } from "../domain/customer";
import type { Database } from "./database";

interface CustomerRow {
  id: string;
  email: string;
  name: string;
  blocked: boolean;
}

export class CustomerRepository {
  constructor(private readonly db: Database) {}

  async findById(id: string): Promise<Customer | undefined> {
    const rows = await this.db.query<CustomerRow>(
      "SELECT id, email, name, blocked FROM customers WHERE id = $1",
      [id],
    );
    return rows[0];
  }

  async findByEmail(email: string): Promise<Customer | undefined> {
    const rows = await this.db.query<CustomerRow>(
      "SELECT id, email, name, blocked FROM customers WHERE lower(email) = lower($1)",
      [email],
    );
    return rows[0];
  }

  async insert(customer: Customer): Promise<void> {
    await this.db.query("INSERT INTO customers (id, email, name, blocked) VALUES ($1, $2, $3, $4)", [
      customer.id,
      customer.email,
      customer.name,
      customer.blocked,
    ]);
  }
}
