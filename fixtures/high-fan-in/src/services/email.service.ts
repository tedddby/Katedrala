import { createLogger } from "../core/logger";
import { UpstreamError } from "../core/errors";

const log = createLogger("services.email");

export class EmailService {
  constructor(
    private readonly apiUrl: string,
    private readonly token: string,
  ) {}

  async send(to: string, subject: string, text: string): Promise<void> {
    const response = await fetch(`${this.apiUrl}/messages`, {
      method: "POST",
      headers: { authorization: `Bearer ${this.token}`, "content-type": "application/json" },
      body: JSON.stringify({ to, subject, text }),
    });
    if (!response.ok) {
      log.warn("mail API rejected message", { to, status: response.status });
      throw new UpstreamError("mail API", response.status);
    }
    log.info("mail sent", { to, subject });
  }
}
