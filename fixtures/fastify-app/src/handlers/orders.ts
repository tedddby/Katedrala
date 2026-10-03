import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateOrderBody, ListOrdersQuery, OrderParams } from "../schemas/order.schema.js";
import { cancelOrder, getOrder, listOrders, placeOrder } from "../services/orders.service.js";
import type { Order } from "../types.js";

export async function listOrdersHandler(request: FastifyRequest<{ Querystring: ListOrdersQuery }>): Promise<Order[]> {
  return listOrders(request.query.customerId);
}

export async function getOrderHandler(request: FastifyRequest<{ Params: OrderParams }>): Promise<Order> {
  return getOrder(request.params.id);
}

export async function createOrderHandler(
  request: FastifyRequest<{ Body: CreateOrderBody }>,
  reply: FastifyReply,
): Promise<Order> {
  const order = await placeOrder(request.body);
  request.log.info({ orderId: order.id, totalCents: order.totals.totalCents }, "order placed");
  void reply.code(201).header("location", `/v1/orders/${order.id}`);
  return order;
}

export async function cancelOrderHandler(request: FastifyRequest<{ Params: OrderParams }>): Promise<Order> {
  return cancelOrder(request.params.id);
}
