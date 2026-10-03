export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export interface LogRecord {
  time: string;
  level: LogLevel;
  scope: string;
  message: string;
  fields: LogFields;
}

export type LogSink = (record: LogRecord) => void;

const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function parseLevel(value: string | undefined): LogLevel | undefined {
  return value === "debug" || value === "info" || value === "warn" || value === "error" ? value : undefined;
}

let threshold: LogLevel = parseLevel(process.env.LOG_LEVEL) ?? "info";
const sinks: LogSink[] = [(record) => process.stdout.write(`${JSON.stringify(record)}\n`)];

export function setLogLevel(level: LogLevel): void {
  threshold = level;
}

export function addLogSink(sink: LogSink): () => void {
  sinks.push(sink);
  return () => {
    const index = sinks.indexOf(sink);
    if (index >= 0) sinks.splice(index, 1);
  };
}

export class Logger {
  constructor(
    readonly scope: string,
    private readonly context: LogFields = {},
  ) {}

  child(scope: string, context: LogFields = {}): Logger {
    return new Logger(`${this.scope}.${scope}`, { ...this.context, ...context });
  }

  debug(message: string, fields?: LogFields): void {
    this.write("debug", message, fields);
  }

  info(message: string, fields?: LogFields): void {
    this.write("info", message, fields);
  }

  warn(message: string, fields?: LogFields): void {
    this.write("warn", message, fields);
  }

  error(message: string, error?: unknown, fields?: LogFields): void {
    const details = error instanceof Error ? { error: error.message, stack: error.stack } : { error };
    this.write("error", message, { ...details, ...fields });
  }

  private write(level: LogLevel, message: string, fields: LogFields = {}): void {
    if (SEVERITY[level] < SEVERITY[threshold]) return;
    const record: LogRecord = {
      time: new Date().toISOString(),
      level,
      scope: this.scope,
      message,
      fields: { ...this.context, ...fields },
    };
    for (const sink of sinks) sink(record);
  }
}

export function createLogger(scope: string, context?: LogFields): Logger {
  return new Logger(scope, context);
}
