import { createLogger } from "../core/logger";
import type { EmailService } from "../services/email.service";
import type { UserStore } from "../storage/user.store";

const log = createLogger("jobs.email-digest");
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export class EmailDigestJob {
  readonly name = "email-digest";
  readonly intervalMs = WEEK_MS;

  constructor(
    private readonly users: UserStore,
    private readonly email: EmailService,
  ) {}

  async run(): Promise<void> {
    const inactive = await this.users.listInactiveSince(new Date(Date.now() - WEEK_MS));
    let sent = 0;
    for (const user of inactive) {
      try {
        await this.email.send(user.email, "We miss you", `Hi ${user.name}, here is what is new this week.`);
        sent++;
      } catch (error) {
        log.warn("digest not delivered", { userId: user.id, error: String(error) });
      }
    }
    log.info("digest sent", { sent, inactive: inactive.length });
  }
}
