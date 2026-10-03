import { randomUUID } from "node:crypto";

export type EntityId<Prefix extends string = string> = `${Prefix}_${string}`;

export function createId<Prefix extends string>(prefix: Prefix): EntityId<Prefix> {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function hasPrefix<Prefix extends string>(id: string, prefix: Prefix): id is EntityId<Prefix> {
  return id.startsWith(`${prefix}_`);
}
