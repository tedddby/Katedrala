export type UserId = string;

export interface User {
  id: UserId;
  email: string;
  name: string;
  billingCountry: string;
  createdAt: Date;
}

export type NewUser = Omit<User, "id" | "createdAt">;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

export function isValidCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code);
}
