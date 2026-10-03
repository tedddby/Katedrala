import type { NextFunction, Request, Response } from "express";
import { createLogger } from "../core/logger";
import { AppError } from "../core/errors";

const log = createLogger("api.auth");

export function requireApiKey(validKeys: readonly string[]) {
  const keys = new Set(validKeys);
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = req.header("x-api-key");
    if (key === undefined || !keys.has(key)) {
      log.warn("rejected request without a valid API key", { path: req.path, ip: req.ip });
      next(new AppError("Missing or invalid API key", 401, "unauthorized"));
      return;
    }
    next();
  };
}
