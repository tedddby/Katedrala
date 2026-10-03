import type { OrderRequest, OrderService } from "@acme/core";
import { formatMoney } from "@acme/shared";

export interface HandlerResult {
  status: number;
  body: unknown;
}

function isOrderRequest(body: unknown): body is OrderRequest {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const candidate = body as Partial<OrderRequest>;
  return (
    typeof candidate.customerEmail === "string" &&
    Array.isArray(candidate.items) &&
    candidate.items.every(
      (item) => typeof item?.productId === "string" && Number.isInteger(item.quantity) && item.quantity > 0,
    )
  );
}

export function placeOrder(orders: OrderService, body: unknown): HandlerResult {
  if (!isOrderRequest(body)) {
    return { status: 400, body: { error: "invalid-request" } };
  }
  const result = orders.placeOrder(body);
  if (!result.ok) {
    return { status: result.error.code === "out-of-stock" ? 409 : 422, body: { error: result.error } };
  }
  const order = result.value;
  return {
    status: 201,
    body: { id: order.id, lines: order.lines.length, total: formatMoney(order.total) },
  };
}
