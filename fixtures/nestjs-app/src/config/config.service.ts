import { Injectable } from "@nestjs/common";

function requireEnv(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(`Environment variable ${name} is required`);
  }
  return value;
}

/** Typed access to the process environment, read once at startup. */
@Injectable()
export class ConfigService {
  readonly environment = process.env.NODE_ENV ?? "development";
  readonly port = Number.parseInt(process.env.PORT ?? "3000", 10);
  readonly databaseUrl = requireEnv("DATABASE_URL", process.env.DATABASE_URL);
  readonly stripeApiKey = requireEnv("STRIPE_API_KEY", process.env.STRIPE_API_KEY);
  readonly internalApiKey = requireEnv("INTERNAL_API_KEY", process.env.INTERNAL_API_KEY);

  get isProduction(): boolean {
    return this.environment === "production";
  }
}
