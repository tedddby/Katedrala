/// <reference path="./globals.d.ts" />
import "./polyfills.js";
import legacyFormat = require("./legacy");
import { Invoice } from "./billing/invoice.js";
import { settings } from "./config.js";
import { OrderRepository } from "./orders/order-repository.js";
import { OrderService, type PlacedOrder } from "./orders/order-service.js";
import type { OrderInput } from "./orders/order.js";

export interface ShopOptions {
  readonly name: string;
  readonly country: string;
}

let createdShops = 0;

export default class Shop {
  static readonly version: string = __APP_VERSION__;

  constructor(
    private readonly options: ShopOptions,
    private readonly orders: OrderService,
  ) {}

  async checkout(input: OrderInput): Promise<Invoice> {
    const placed: PlacedOrder = await this.orders.place(input);
    return Invoice.fromOrder(placed.order, this.options.country);
  }

  describe(totalCents: number): string {
    return `${this.options.name} v${Shop.version}: ${legacyFormat(totalCents, settings.currency)}`;
  }

  async salesReport(customerId: string): Promise<string> {
    // Reporting code is only loaded when a report is requested.
    const { buildSalesReport } = await import("./lazy");
    return buildSalesReport(await this.orders.history(customerId));
  }
}

export function createShop(options: Partial<ShopOptions> = {}): Shop {
  createdShops += 1;
  const service = new OrderService(new OrderRepository());
  return new Shop(
    { name: options.name ?? settings.shopName, country: options.country ?? settings.country },
    service,
  );
}

export function shopsCreated(): number {
  return createdShops;
}
