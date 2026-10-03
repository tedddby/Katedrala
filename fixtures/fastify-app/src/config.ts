function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export const config = {
  host: process.env["HOST"] ?? "0.0.0.0",
  port: Number(process.env["PORT"] ?? 8080),
  logLevel: process.env["LOG_LEVEL"] ?? "info",
  mongoUrl: process.env["MONGO_URL"] ?? "mongodb://localhost:27017",
  mongoDatabase: process.env["MONGO_DB"] ?? "fulfillment",
  apiKeys: list(process.env["API_KEYS"]),
  corsOrigins: list(process.env["CORS_ORIGINS"]),
  shipEngineApiKey: process.env["SHIPENGINE_API_KEY"] ?? "",
} as const;
