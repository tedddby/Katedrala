import { promises as fs } from "node:fs";

export class AuditAdapter {
  constructor(private readonly logPath: string) {}

  async record(event: string, details: Record<string, unknown> = {}): Promise<void> {
    const line = JSON.stringify({ at: new Date().toISOString(), event, ...details });
    await fs.appendFile(this.logPath, `${line}\n`, "utf8");
  }
}
