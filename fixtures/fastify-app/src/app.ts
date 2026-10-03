import cors from "@fastify/cors";
import fastify from "fastify";
import { config } from "./config.js";
import { createOrderHandler } from "./handlers/orders.js";
import { verifyApiKey } from "./hooks/auth.js";
import ordersPlugin from "./plugins/orders.js";
import { healthHandler } from "./routes/health.js";
import { createOrderBodySchema, type CreateOrderBody } from "./schemas/order.schema.js";

const app = fastify({
  logger: { level: config.logLevel },
  trustProxy: true,
});

app.register(cors, { origin: config.corsOrigins });

app.get("/health", healthHandler);
app.register(ordersPlugin, { prefix: "/v1" });

// Unversioned endpoint still called by checkout widgets built before /v1 existed.
app.route<{ Body: CreateOrderBody }>({
  method: "POST",
  url: "/orders",
  schema: { body: createOrderBodySchema },
  onRequest: verifyApiKey,
  handler: createOrderHandler,
});

export default app;
