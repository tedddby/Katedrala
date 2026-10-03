import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../errors.js";
import { logger } from "../logger.js";

const exposeStack = process.env.NODE_ENV !== "production";

/** Terminal middleware for requests that matched no route. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: "route_not_found", message: `No route for ${req.method} ${req.path}` } });
}

/** Error-handling middleware (four parameters): renders HttpErrors, hides everything else. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error("unhandled error", { path: req.originalUrl, error: error.message });
  res.status(500).json({
    error: {
      code: "internal_error",
      message: "Internal server error",
      ...(exposeStack ? { stack: error.stack } : {}),
    },
  });
}
