import type { FastifyInstance } from "fastify";
import { cancelOrderHandler, createOrderHandler, getOrderHandler, listOrdersHandler } from "../handlers/orders.js";
import { verifyApiKey } from "../hooks/auth.js";
import {
  createOrderBodySchema,
  listOrdersQuerySchema,
  orderParamsSchema,
  type CreateOrderBody,
  type ListOrdersQuery,
  type OrderParams,
} from "../schemas/order.schema.js";

/**
 * Order management API. The plugin is encapsulated (not wrapped with fastify-plugin), so the API-key hook
 * applies only to the routes registered here.
 */
export default async function ordersPlugin(instance: FastifyInstance): Promise<void> {
  instance.addHook("onRequest", verifyApiKey);

  instance.get<{ Querystring: ListOrdersQuery }>(
    "/orders",
    { schema: { querystring: listOrdersQuerySchema } },
    listOrdersHandler,
  );
  instance.get<{ Params: OrderParams }>("/orders/:id", getOrderHandler);
  instance.post<{ Body: CreateOrderBody }>("/orders", { schema: { body: createOrderBodySchema } }, createOrderHandler);
  instance.route<{ Params: OrderParams }>({
    method: "DELETE",
    url: "/orders/:id",
    schema: { params: orderParamsSchema },
    handler: cancelOrderHandler,
  });
}
