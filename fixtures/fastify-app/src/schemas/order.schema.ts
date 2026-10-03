import type { OrderLine } from "../types.js";

export const orderParamsSchema = {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string", pattern: "^[0-9a-f]{24}$" },
  },
} as const;

export const listOrdersQuerySchema = {
  type: "object",
  properties: {
    customerId: { type: "string", minLength: 1 },
  },
} as const;

export const createOrderBodySchema = {
  type: "object",
  required: ["customerId", "shippingCountry", "lines"],
  additionalProperties: false,
  properties: {
    customerId: { type: "string", minLength: 1 },
    shippingCountry: { type: "string", pattern: "^[A-Z]{2}$" },
    lines: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["sku", "quantity", "unitPriceCents", "weightGrams"],
        additionalProperties: false,
        properties: {
          sku: { type: "string", minLength: 1 },
          quantity: { type: "integer", minimum: 1 },
          unitPriceCents: { type: "integer", minimum: 0 },
          weightGrams: { type: "integer", minimum: 1 },
        },
      },
    },
  },
} as const;

export interface OrderParams {
  id: string;
}

export interface ListOrdersQuery {
  customerId?: string;
}

export interface CreateOrderBody {
  customerId: string;
  shippingCountry: string;
  lines: OrderLine[];
}
