import type { ErpAdapter } from "../adapters/erp.adapter";

export interface PricedLine {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PricedOrder {
  subtotalCents: number;
  weightGrams: number;
  lines: PricedLine[];
}

export class PricingService {
  constructor(private readonly erp: ErpAdapter) {}

  async price(lines: ReadonlyArray<{ sku: string; quantity: number }>): Promise<PricedOrder> {
    const entries = await this.erp.priceList(lines.map((line) => line.sku));
    const bySku = new Map(entries.map((entry) => [entry.sku, entry]));
    let subtotalCents = 0;
    let weightGrams = 0;
    const priced = lines.map((line) => {
      const entry = bySku.get(line.sku);
      if (entry === undefined) {
        throw new Error(`No price list entry for ${line.sku}`);
      }
      subtotalCents += entry.unitPriceCents * line.quantity;
      weightGrams += entry.weightGrams * line.quantity;
      return { sku: line.sku, quantity: line.quantity, unitPriceCents: entry.unitPriceCents };
    });
    return { subtotalCents, weightGrams, lines: priced };
  }
}
