import app from "./app.js";
import { config } from "./config.js";
import { closeDatabase } from "./db.js";

app.addHook("onClose", closeDatabase);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error(error, "graceful shutdown failed");
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error, "failed to start");
  process.exit(1);
}
