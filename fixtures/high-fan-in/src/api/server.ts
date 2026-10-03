import type { Server } from "node:http";
import express, { type NextFunction, type Request, type Response } from "express";
import type { ServiceConfig } from "../core/config";
import { isAppError } from "../core/errors";
import { createLogger } from "../core/logger";
import { requireApiKey } from "./auth.middleware";
import { createRouter, type RouteServices } from "./router";

const log = createLogger("api.server");

export function startServer(config: ServiceConfig, services: RouteServices): Server {
  const app = express();
  app.use(express.json());
  app.use(requireApiKey(config.apiKeys));
  app.use("/api", createRouter(services));
  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (isAppError(error)) {
      res.status(error.status).json({ error: error.code, message: error.message });
      return;
    }
    log.error("unhandled error", error, { path: req.path });
    res.status(500).json({ error: "internal_error" });
  });
  return app.listen(config.port, () => log.info("listening", { port: config.port }));
}
