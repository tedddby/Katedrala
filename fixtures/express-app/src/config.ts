export interface AppConfig {
  port: number;
  databaseUrl: string;
  stripeSecretKey: string;
  authTokenSecret: string;
}

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const config: AppConfig = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL),
  stripeSecretKey: required("STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY),
  authTokenSecret: required("AUTH_TOKEN_SECRET", process.env.AUTH_TOKEN_SECRET),
};
