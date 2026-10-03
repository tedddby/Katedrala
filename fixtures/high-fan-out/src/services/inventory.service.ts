import type { WarehouseAdapter, WarehouseItem } from "../adapters/warehouse.adapter";

export type ReservationResult = { ok: true; id: string } | { ok: false; missing: string[] };

export class InventoryService {
  constructor(private readonly warehouse: WarehouseAdapter) {}

  async reserve(orderId: string, items: readonly WarehouseItem[]): Promise<ReservationResult> {
    const levels = await this.warehouse.stockLevels(items.map((item) => item.sku));
    const available = new Map(levels.map((level) => [level.sku, level.available]));
    const missing = items.filter((item) => (available.get(item.sku) ?? 0) < item.quantity).map((item) => item.sku);
    if (missing.length > 0) {
      return { ok: false, missing };
    }
    const id = await this.warehouse.hold(orderId, items);
    return { ok: true, id };
  }

  async release(reservationId: string): Promise<void> {
    await this.warehouse.releaseHold(reservationId);
  }
}
