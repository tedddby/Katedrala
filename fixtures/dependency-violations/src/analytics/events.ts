export type EventName =
  | "order_placed"
  | "checkout_started"
  | "payment_succeeded"
  | "payment_declined"
  | "refund_issued";

export type EventProperties = Record<string, string | number | boolean>;

export interface TrackedEvent {
  name: EventName;
  properties: EventProperties;
  timestamp: string;
}

export function createEvent(name: EventName, properties: EventProperties, now: Date = new Date()): TrackedEvent {
  return { name, properties, timestamp: now.toISOString() };
}
