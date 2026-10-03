import { productName } from "../catalog/product-service";
import { table } from "../lib/db";
import { publish } from "../lib/events";
import { available, LOW_STOCK_THRESHOLD, type StockLevel } from "./stock-level";

const levels = table<StockLevel>("stock_levels");

export function stockFor(productId: string): StockLevel[] {
  return levels.where((level) => level.productId === productId);
}

export function totalAvailable(productId: string): number {
  return stockFor(productId).reduce((sum, level) => sum + available(level), 0);
}

export function adjustStock(productId: string, warehouseId: string, delta: number): StockLevel {
  const id = `${productId}@${warehouseId}`;
  const current = levels.get(id) ?? { id, productId, warehouseId, onHand: 0, reserved: 0 };
  const updated = levels.upsert({ ...current, onHand: Math.max(0, current.onHand + delta) });

  const remaining = totalAvailable(productId);
  if (delta < 0 && remaining < LOW_STOCK_THRESHOLD) {
    console.warn(`Low stock for ${productName(productId)}: ${remaining} left`);
    publish("stock.low", { productId, remaining });
  }
  return updated;
}
