import type { AuthUser } from "../models/user.js";

declare global {
  namespace Express {
    interface Request {
      /** Set by `authMiddleware` once the bearer token has been verified. */
      user?: AuthUser;
    }
  }
}

export {};
