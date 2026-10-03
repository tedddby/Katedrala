import type { LogLevel } from "./config";

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

type Context = Record<string, unknown>;

export interface Logger {
  debug(message: string, context?: Context): void;
  info(message: string, context?: Context): void;
  warn(message: string, context?: Context): void;
  error(message: string, context?: Context): void;
  child(bindings: Context): Logger;
}

export function createLogger(level: LogLevel = "info", bindings: Context = {}): Logger {
  const write = (entryLevel: LogLevel, message: string, context: Context = {}): void => {
    if (ORDER[entryLevel] < ORDER[level]) {
      return;
    }
    const line = JSON.stringify({
      time: new Date().toISOString(),
      level: entryLevel,
      message,
      ...bindings,
      ...context,
    });
    if (entryLevel === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  };

  return {
    debug: (message, context) => write("debug", message, context),
    info: (message, context) => write("info", message, context),
    warn: (message, context) => write("warn", message, context),
    error: (message, context) => write("error", message, context),
    child: (extra) => createLogger(level, { ...bindings, ...extra }),
  };
}
