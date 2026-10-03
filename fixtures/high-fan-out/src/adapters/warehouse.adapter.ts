import { HttpClient } from "./http-client";

export interface StockLevel {
  sku: string;
  available: number;
}

export interface WarehouseItem {
  sku: string;
  quantity: number;
}

export class WarehouseAdapter {
  private readonly http: HttpClient;

  constructor(baseUrl: string) {
    this.http = new HttpClient({ baseUrl, retries: 3 });
  }

  async stockLevels(skus: readonly string[]): Promise<StockLevel[]> {
    return this.http.post<StockLevel[]>("/stock/query", { skus });
  }

  async hold(reference: string, items: readonly WarehouseItem[]): Promise<string> {
    const result = await this.http.post<{ holdId: string }>("/holds", { reference, items });
    return result.holdId;
  }

  async releaseHold(holdId: string): Promise<void> {
    await this.http.post(`/holds/${holdId}/release`, {});
  }

  async createPickList(orderId: string, items: readonly WarehouseItem[], carrier: string): Promise<void> {
    await this.http.post("/pick-lists", { orderId, items, carrier });
  }
}
