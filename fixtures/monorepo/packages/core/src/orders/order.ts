import { addMoney, money, multiplyMoney, type Money } from "@acme/shared";
import type { Product } from "../catalog/product";

export interface OrderLine {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: Money;
}

export interface Order {
  id: string;
  customerEmail: string;
  lines: OrderLine[];
  total: Money;
  createdAt: Date;
}

export function lineFor(product: Product, quantity: number): OrderLine {
  return { productId: product.id, name: product.name, quantity, unitPrice: product.price };
}

export function totalOf(lines: OrderLine[], currency = "USD"): Money {
  return lines.reduce((sum, line) => addMoney(sum, multiplyMoney(line.unitPrice, line.quantity)), money(0, currency));
}
