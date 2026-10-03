export interface ServiceConfig {
  port: number;
  apiKeys: string[];
  databaseUrl: string;
  mailApiUrl: string;
  mailApiToken: string;
  inventoryApiUrl: string;
  paymentApiUrl: string;
  reportRecipients: string[];
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
  return {
    port: Number(env.PORT ?? 8080),
    apiKeys: list(env.API_KEYS),
    databaseUrl: env.DATABASE_URL ?? "postgres://localhost:5432/shop",
    mailApiUrl: env.MAIL_API_URL ?? "https://mail.example.com/v3",
    mailApiToken: env.MAIL_API_TOKEN ?? "",
    inventoryApiUrl: env.INVENTORY_API_URL ?? "https://inventory.example.com/api",
    paymentApiUrl: env.PAYMENT_API_URL ?? "https://payments.example.com/v1",
    reportRecipients: list(env.REPORT_RECIPIENTS),
  };
}
