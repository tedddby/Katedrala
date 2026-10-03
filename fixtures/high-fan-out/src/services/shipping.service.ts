import type { DhlAdapter } from "../adapters/dhl.adapter";
import type { UpsAdapter } from "../adapters/ups.adapter";

export interface ShippingAddress {
  street: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface Shipment {
  carrier: "dhl" | "ups";
  trackingNumber: string;
  costCents: number;
}

export class ShippingService {
  constructor(
    private readonly dhl: DhlAdapter,
    private readonly ups: UpsAdapter,
  ) {}

  async book(orderId: string, address: ShippingAddress, weightGrams: number): Promise<Shipment> {
    const [dhlCost, upsCost] = await Promise.all([
      this.dhl.quote(address.postalCode, address.country, weightGrams),
      this.ups.rate(address, weightGrams),
    ]);
    if (dhlCost <= upsCost) {
      const shipment = await this.dhl.createShipment(orderId, address, weightGrams);
      return { carrier: "dhl", trackingNumber: shipment.shipmentTrackingNumber, costCents: dhlCost };
    }
    const label = await this.ups.ship(orderId, address, weightGrams);
    return { carrier: "ups", trackingNumber: label.trackingNumber, costCents: upsCost };
  }
}
