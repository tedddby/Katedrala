import { ConflictError, NotFoundError, ValidationError } from "@/shared/errors";
import type { Logger } from "@/shared/logger";
import { isValidCountryCode, isValidEmail, normalizeEmail, type NewUser, type User } from "../models/user";
import { UserRepository } from "../repositories/user.repository";

export class UserService {
  constructor(
    private readonly users: UserRepository,
    private readonly logger: Logger,
  ) {}

  async register(input: NewUser): Promise<User> {
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    const billingCountry = input.billingCountry.toUpperCase();

    if (!isValidEmail(email)) {
      throw new ValidationError("Email address is invalid", "email");
    }
    if (name === "") {
      throw new ValidationError("Name is required", "name");
    }
    if (!isValidCountryCode(billingCountry)) {
      throw new ValidationError("Billing country must be an ISO 3166-1 alpha-2 code", "billingCountry");
    }
    if ((await this.users.findByEmail(email)) !== undefined) {
      throw new ConflictError(`A user with email ${email} already exists`);
    }

    const user = await this.users.insert({ email, name, billingCountry });
    this.logger.info("User registered", { userId: user.id });
    return user;
  }

  async getById(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (user === undefined) {
      throw new NotFoundError("User", id);
    }
    return user;
  }
}
