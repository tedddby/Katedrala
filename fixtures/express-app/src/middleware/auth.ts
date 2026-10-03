import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { UnauthorizedError } from "../errors.js";
import { USER_ROLES, type AuthUser, type UserRole } from "../models/user.js";

function sign(payload: string): string {
  return createHmac("sha256", config.authTokenSecret).update(payload).digest("base64url");
}

/**
 * Verifies a `<payload>.<signature>` bearer token, where the payload is base64url("<userId>:<role>:<expiresAt>")
 * and the signature is an HMAC-SHA256 of the payload.
 */
export function verifyToken(token: string): AuthUser | undefined {
  const [payload, signature] = token.split(".");
  if (payload === undefined || signature === undefined) {
    return undefined;
  }
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return undefined;
  }
  const [id, role, expiresAt] = Buffer.from(payload, "base64url").toString("utf8").split(":");
  if (id === undefined || role === undefined || expiresAt === undefined) {
    return undefined;
  }
  if (!USER_ROLES.includes(role as UserRole) || Number(expiresAt) * 1000 < Date.now()) {
    return undefined;
  }
  return { id, role: role as UserRole };
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header === undefined || !header.startsWith("Bearer ")) {
    next(new UnauthorizedError());
    return;
  }
  const user = verifyToken(header.slice("Bearer ".length));
  if (user === undefined) {
    next(new UnauthorizedError("Invalid or expired token"));
    return;
  }
  req.user = user;
  next();
}
