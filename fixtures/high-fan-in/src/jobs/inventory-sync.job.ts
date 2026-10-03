import { createLogger } from "../core/logger";
import type { InventoryService } from "../services/inventory.service";

const log = createLogger("jobs.inventory-sync");

export class InventorySyncJob {
  readonly name = "inventory-sync";
  readonly intervalMs = 5 * 60 * 1000;

  constructor(private readonly inventory: InventoryService) {}

  async run(): Promise<void> {
    const count = await this.inventory.syncFromWarehouse();
    log.debug("synchronized", { count });
  }
}
