import type { FastifyReply, FastifyRequest } from "fastify";
import { pingDatabase } from "../db.js";

export async function healthHandler(_request: FastifyRequest, reply: FastifyReply): Promise<{ status: string }> {
  const databaseUp = await pingDatabase();
  void reply.code(databaseUp ? 200 : 503);
  return { status: databaseUp ? "ok" : "degraded" };
}
