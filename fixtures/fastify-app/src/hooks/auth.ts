import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

/** Rejects requests that do not carry one of the configured API keys in the `x-api-key` header. */
export async function verifyApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const key = request.headers["x-api-key"];
  if (typeof key !== "string" || !config.apiKeys.includes(key)) {
    request.log.warn({ ip: request.ip, url: request.url }, "rejected request without a valid API key");
    await reply.code(401).send({ error: "Unauthorized", message: "Missing or invalid API key" });
  }
}
