import { HttpClient } from "./http-client";

export interface UpsAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface UpsLabel {
  trackingNumber: string;
  labelUrl: string;
}

export class UpsAdapter {
  private readonly http: HttpClient;

  constructor(accessToken: string) {
    this.http = new HttpClient({
      baseUrl: "https://onlinetools.ups.com/api",
      headers: { authorization: `Bearer ${accessToken}` },
    });
  }

  async rate(address: UpsAddress, weightGrams: number): Promise<number> {
    const response = await this.http.post<{ RateResponse: { totalChargesCents: number } }>("/rating/v2403/Rate", {
      shipTo: address,
      weightKg: weightGrams / 1000,
    });
    return response.RateResponse.totalChargesCents;
  }

  async ship(reference: string, address: UpsAddress, weightGrams: number): Promise<UpsLabel> {
    return this.http.post<UpsLabel>("/shipments/v2403/ship", { reference, shipTo: address, weightKg: weightGrams / 1000 });
  }
}
