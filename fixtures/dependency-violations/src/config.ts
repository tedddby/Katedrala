export interface AppConfig {
  port: number;
  databaseUrl: string;
  paymentsApiKey: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required("DATABASE_URL"),
    paymentsApiKey: required("PAYMENTS_API_KEY"),
  };
}
