export type LogLevel = "debug" | "info" | "warn" | "error";

export interface AppConfig {
  port: number;
  databaseUrl: string;
  paymentProviderUrl: string;
  paymentProviderKey: string;
  logLevel: LogLevel;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function isLogLevel(value: string): value is LogLevel {
  return value === "debug" || value === "info" || value === "warn" || value === "error";
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const logLevel = env.LOG_LEVEL ?? "info";
  return {
    port: Number(env.PORT ?? 3000),
    databaseUrl: required(env, "DATABASE_URL"),
    paymentProviderUrl: env.PAYMENT_PROVIDER_URL ?? "https://api.payments.example.com/v1",
    paymentProviderKey: required(env, "PAYMENT_PROVIDER_KEY"),
    logLevel: isLogLevel(logLevel) ? logLevel : "info",
  };
}
