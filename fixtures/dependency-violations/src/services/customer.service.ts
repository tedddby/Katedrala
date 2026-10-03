import { randomUUID } from "node:crypto";
import type { Customer } from "../domain/customer";
import { CustomerRepository } from "../repositories/customer.repository";

export class CustomerNotFoundError extends Error {
  constructor(readonly customerId: string) {
    super(`Customer ${customerId} not found`);
    this.name = "CustomerNotFoundError";
  }
}

export class CustomerService {
  constructor(private readonly customers: CustomerRepository) {}

  async getCustomer(id: string): Promise<Customer> {
    const customer = await this.customers.findById(id);
    if (customer === undefined) {
      throw new CustomerNotFoundError(id);
    }
    return customer;
  }

  async register(email: string, name: string): Promise<Customer> {
    const existing = await this.customers.findByEmail(email);
    if (existing !== undefined) {
      return existing;
    }
    const customer: Customer = {
      id: randomUUID(),
      email: email.trim().toLowerCase(),
      name: name.trim(),
      blocked: false,
    };
    await this.customers.insert(customer);
    return customer;
  }
}
