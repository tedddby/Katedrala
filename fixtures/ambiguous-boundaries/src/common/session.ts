import { randomUUID } from "node:crypto";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function newSessionId(): string {
  return randomUUID();
}

export function isValidSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}
