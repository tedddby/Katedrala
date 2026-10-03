import { createLogger } from "../core/logger";
import { NotFoundError, ValidationError } from "../core/errors";
import type { TtlCache } from "../storage/cache";
import type { Product, ProductStore } from "../storage/product.store";

const log = createLogger("services.inventory");

export class InventoryService {
  constructor(
    private readonly products: ProductStore,
    private readonly cache: TtlCache<Product>,
    private readonly apiUrl: string,
  ) {}

  async getProduct(sku: string): Promise<Product> {
    const cached = this.cache.get(sku);
    if (cached !== undefined) return cached;
    const product = await this.products.findBySku(sku);
    if (product === undefined) throw new NotFoundError("Product", sku);
    this.cache.set(sku, product);
    return product;
  }

  async reserve(sku: string, quantity: number): Promise<Product> {
    const product = await this.getProduct(sku);
    if (product.stock < quantity) {
      throw new ValidationError(`Only ${product.stock} units of ${sku} left`);
    }
    await this.products.updateStock(sku, product.stock - quantity);
    log.info("stock reserved", { sku, quantity });
    return product;
  }

  async syncFromWarehouse(): Promise<number> {
    const response = await fetch(`${this.apiUrl}/stock-levels`);
    const levels = (await response.json()) as Array<{ sku: string; stock: number }>;
    for (const level of levels) {
      await this.products.updateStock(level.sku, level.stock);
    }
    this.cache.clear();
    log.info("stock levels synchronized", { count: levels.length });
    return levels.length;
  }
}
