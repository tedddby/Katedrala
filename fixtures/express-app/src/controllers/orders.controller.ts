import type { NextFunction, Request, Response } from "express";
import { orderService } from "../container.js";
import { UnauthorizedError, ValidationError } from "../errors.js";
import type { CreateOrderInput, OrderItem } from "../models/order.js";

function parseItem(value: unknown, index: number): OrderItem {
  if (typeof value !== "object" || value === null) {
    throw new ValidationError(`items[${index}] must be an object`);
  }
  const { sku, quantity, unitPriceCents } = value as Record<string, unknown>;
  if (typeof sku !== "string" || sku.length === 0) {
    throw new ValidationError(`items[${index}].sku is required`);
  }
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity <= 0) {
    throw new ValidationError(`items[${index}].quantity must be a positive integer`);
  }
  if (typeof unitPriceCents !== "number" || !Number.isInteger(unitPriceCents) || unitPriceCents < 0) {
    throw new ValidationError(`items[${index}].unitPriceCents must be a non-negative integer`);
  }
  return { sku, quantity, unitPriceCents };
}

function parseCreateOrderBody(body: unknown): CreateOrderInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("request body must be a JSON object");
  }
  const { items, currency, paymentSource } = body as Record<string, unknown>;
  if (!Array.isArray(items)) {
    throw new ValidationError("items must be an array");
  }
  if (typeof currency !== "string" || typeof paymentSource !== "string") {
    throw new ValidationError("currency and paymentSource are required");
  }
  return { items: items.map(parseItem), currency: currency.toLowerCase(), paymentSource };
}

export async function createOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user === undefined) {
      throw new UnauthorizedError();
    }
    const order = await orderService.placeOrder(req.user.id, parseCreateOrderBody(req.body));
    res.status(201).location(`/api/orders/${order.id}`).json(order);
  } catch (error) {
    next(error);
  }
}

export async function getOrder(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user === undefined) {
      throw new UnauthorizedError();
    }
    res.json(await orderService.getForUser(req.params.id, req.user.id));
  } catch (error) {
    next(error);
  }
}
