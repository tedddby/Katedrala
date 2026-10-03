export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(minimumLevel: LogLevel, write: (line: string) => void = console.log): Logger {
  const log = (level: LogLevel, message: string): void => {
    if (LEVEL_ORDER[level] >= LEVEL_ORDER[minimumLevel]) {
      write(level === "info" ? message : `[${level}] ${message}`);
    }
  };
  return {
    debug: (message) => log("debug", message),
    info: (message) => log("info", message),
    warn: (message) => log("warn", message),
    error: (message) => log("error", message),
  };
}
