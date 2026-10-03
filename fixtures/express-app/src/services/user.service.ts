import { NotFoundError, ValidationError } from "../errors.js";
import type { CreateUserInput, User } from "../models/user.js";
import type { UserRepository } from "../repositories/user.repository.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class UserService {
  constructor(private readonly users: UserRepository) {}

  async getById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (user === undefined) {
      throw new NotFoundError("User", id);
    }
    return user;
  }

  async register(input: CreateUserInput): Promise<User> {
    if (!EMAIL_PATTERN.test(input.email)) {
      throw new ValidationError("email is not a valid address");
    }
    if (input.name.length === 0) {
      throw new ValidationError("name must not be empty");
    }
    const existing = await this.users.findByEmail(input.email);
    if (existing !== undefined) {
      throw new ValidationError("email is already registered");
    }
    return this.users.insert(input);
  }
}
