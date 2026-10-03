import { HttpClient } from "./http-client";

export interface PriceListEntry {
  sku: string;
  unitPriceCents: number;
  weightGrams: number;
}

export interface ErpInvoice {
  number: string;
  orderId: string;
  netCents: number;
  taxCents: number;
}

export class ErpAdapter {
  private readonly http: HttpClient;

  constructor(baseUrl: string) {
    this.http = new HttpClient({ baseUrl });
  }

  async priceList(skus: readonly string[]): Promise<PriceListEntry[]> {
    return this.http.post<PriceListEntry[]>("/price-list/lookup", { skus });
  }

  async nextInvoiceNumber(): Promise<string> {
    const result = await this.http.post<{ number: string }>("/invoices/numbers", {});
    return result.number;
  }

  async bookInvoice(invoice: ErpInvoice): Promise<void> {
    await this.http.post("/invoices", invoice);
  }

  async recordSale(orderId: string, totalCents: number, invoiceNumber: string): Promise<void> {
    await this.http.post("/sales", { orderId, totalCents, invoiceNumber });
  }
}
