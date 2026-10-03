type Level = "debug" | "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const severity: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function parseLevel(value: string | undefined): Level {
  return value === "debug" || value === "info" || value === "warn" || value === "error" ? value : "info";
}

const threshold = severity[parseLevel(process.env.LOG_LEVEL)];

function write(level: Level, message: string, fields: Fields = {}): void {
  if (severity[level] < threshold) {
    return;
  }
  const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...fields });
  if (level === "warn" || level === "error") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

export const logger = {
  debug(message: string, fields?: Fields): void {
    write("debug", message, fields);
  },
  info(message: string, fields?: Fields): void {
    write("info", message, fields);
  },
  warn(message: string, fields?: Fields): void {
    write("warn", message, fields);
  },
  error(message: string, fields?: Fields): void {
    write("error", message, fields);
  },
};
