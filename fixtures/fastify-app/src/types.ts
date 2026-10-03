import type { ObjectId } from "mongodb";

export type OrderStatus = "pending" | "confirmed" | "cancelled";

export interface OrderLine {
  sku: string;
  quantity: number;
  unitPriceCents: number;
  weightGrams: number;
}

export interface Totals {
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
}

/** An order as stored in the `orders` collection. */
export interface OrderDocument {
  _id: ObjectId;
  customerId: string;
  status: OrderStatus;
  lines: OrderLine[];
  shippingCountry: string;
  carrier: string;
  totals: Totals;
  createdAt: Date;
  updatedAt: Date;
}

/** An order as returned by the API. */
export interface Order extends Omit<OrderDocument, "_id"> {
  id: string;
}
