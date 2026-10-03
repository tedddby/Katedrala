import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { AppError, ValidationError } from "./errors";
import type { Logger } from "./logger";

export interface HttpRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export interface HttpResponse {
  status: number;
  body?: unknown;
}

export type Handler = (request: HttpRequest) => Promise<HttpResponse>;

interface Route {
  method: string;
  segments: string[];
  handler: Handler;
}

export class Router {
  private readonly routes: Route[] = [];

  get(pattern: string, handler: Handler): this {
    return this.add("GET", pattern, handler);
  }

  post(pattern: string, handler: Handler): this {
    return this.add("POST", pattern, handler);
  }

  match(method: string, path: string): { handler: Handler; params: Record<string, string> } | undefined {
    const parts = path.split("/").filter(Boolean);
    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== parts.length) {
        continue;
      }
      const params: Record<string, string> = {};
      const matches = route.segments.every((segment, index) => {
        const part = parts[index] ?? "";
        if (segment.startsWith(":")) {
          params[segment.slice(1)] = decodeURIComponent(part);
          return true;
        }
        return segment === part;
      });
      if (matches) {
        return { handler: route.handler, params };
      }
    }
    return undefined;
  }

  private add(method: string, pattern: string, handler: Handler): this {
    this.routes.push({ method, segments: pattern.split("/").filter(Boolean), handler });
    return this;
  }
}

export function ok(body: unknown): HttpResponse {
  return { status: 200, body };
}

export function created(body: unknown): HttpResponse {
  return { status: 201, body };
}

function field(body: unknown, name: string): unknown {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>)[name] : undefined;
}

export function requireString(body: unknown, name: string): string {
  const value = field(body, name);
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`"${name}" must be a non-empty string`, name);
  }
  return value;
}

export function requireNumber(body: unknown, name: string): number {
  const value = field(body, name);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ValidationError(`"${name}" must be a number`, name);
  }
  return value;
}

export function requireArray(body: unknown, name: string): unknown[] {
  const value = field(body, name);
  if (!Array.isArray(value)) {
    throw new ValidationError(`"${name}" must be an array`, name);
  }
  return value;
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("Request body is not valid JSON");
  }
}

function send(response: ServerResponse, { status, body }: HttpResponse): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

export function startServer(router: Router, port: number, logger: Logger): Server {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const method = req.method ?? "GET";
    const match = router.match(method, url.pathname);
    if (match === undefined) {
      send(res, { status: 404, body: { error: "route_not_found" } });
      return;
    }
    try {
      const body = await readJson(req);
      send(res, await match.handler({ method, path: url.pathname, params: match.params, query: url.searchParams, body }));
    } catch (error) {
      if (error instanceof AppError) {
        send(res, { status: error.status, body: { error: error.code, message: error.message } });
        return;
      }
      logger.error("Unhandled request error", { method, path: url.pathname, error: String(error) });
      send(res, { status: 500, body: { error: "internal_error" } });
    }
  });
  server.listen(port, () => logger.info(`Listening on port ${port}`));
  return server;
}
