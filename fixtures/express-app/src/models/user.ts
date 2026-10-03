export type UserRole = "customer" | "admin";

export const USER_ROLES: readonly UserRole[] = ["customer", "admin"];

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
}

/** The authenticated principal that `authMiddleware` attaches to `req.user`. */
export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface CreateUserInput {
  email: string;
  name: string;
}
