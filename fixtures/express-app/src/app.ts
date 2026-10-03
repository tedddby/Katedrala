import express from "express";
import { healthCheck } from "./controllers/index.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import router from "./routes/index.js";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));
  app.use(requestLogger);

  app.get("/health", healthCheck);
  app.use("/api", router);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
