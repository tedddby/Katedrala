import { EventEmitter } from "node:events";

export interface DomainEvents {
  "order.placed": { orderId: string; customerId: string; lines: Array<{ productId: string; quantity: number }> };
  "order.refunded": { orderId: string; customerId: string };
  "stock.low": { productId: string; remaining: number };
}

const bus = new EventEmitter();

export function publish<K extends keyof DomainEvents>(name: K, payload: DomainEvents[K]): void {
  bus.emit(name, payload);
}

export function subscribe<K extends keyof DomainEvents>(
  name: K,
  handler: (payload: DomainEvents[K]) => void,
): () => void {
  bus.on(name, handler);
  return () => {
    bus.off(name, handler);
  };
}
