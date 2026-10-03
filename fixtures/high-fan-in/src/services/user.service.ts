import { randomUUID } from "node:crypto";
import { createLogger } from "../core/logger";
import { NotFoundError, ValidationError } from "../core/errors";
import type { User, UserStore } from "../storage/user.store";
import type { EmailService } from "./email.service";

const log = createLogger("services.users");

export class UserService {
  constructor(
    private readonly users: UserStore,
    private readonly email: EmailService,
  ) {}

  async register(email: string, name: string): Promise<User> {
    if (!email.includes("@")) {
      throw new ValidationError(`Invalid e-mail address: ${email}`);
    }
    const user: User = {
      id: randomUUID(),
      email: email.toLowerCase(),
      name,
      createdAt: new Date(),
      lastSeenAt: null,
    };
    await this.users.insert(user);
    await this.email.send(user.email, "Welcome!", `Hi ${name}, thanks for signing up.`);
    log.info("user registered", { id: user.id });
    return user;
  }

  async get(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (user === undefined) throw new NotFoundError("User", id);
    return user;
  }
}
