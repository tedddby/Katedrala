import { HttpClient } from "./http-client";

export interface DhlRecipient {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface DhlShipment {
  shipmentTrackingNumber: string;
  estimatedDeliveryDate: string;
}

export class DhlAdapter {
  private readonly http: HttpClient;

  constructor(apiKey: string) {
    this.http = new HttpClient({
      baseUrl: "https://express.api.dhl.com/mydhlapi",
      headers: { "dhl-api-key": apiKey },
    });
  }

  async quote(postalCode: string, country: string, weightGrams: number): Promise<number> {
    const result = await this.http.post<{ totalPriceCents: number }>("/rates", {
      postalCode,
      country,
      weightKg: weightGrams / 1000,
    });
    return result.totalPriceCents;
  }

  async createShipment(reference: string, recipient: DhlRecipient, weightGrams: number): Promise<DhlShipment> {
    return this.http.post<DhlShipment>("/shipments", { reference, recipient, weightKg: weightGrams / 1000 });
  }
}
