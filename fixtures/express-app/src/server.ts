import "dotenv/config";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { closePool } from "./db/pool.js";
import { logger } from "./logger.js";

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info("orders-api listening", { port: config.port });
});

function shutdown(signal: NodeJS.Signals): void {
  logger.info("shutting down", { signal });
  server.close(() => {
    closePool().then(
      () => process.exit(0),
      (error: unknown) => {
        logger.error("failed to close the database pool", { error: String(error) });
        process.exit(1);
      },
    );
  });
}

process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
