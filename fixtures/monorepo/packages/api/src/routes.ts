import type { IncomingMessage, ServerResponse } from "node:http";
import { Catalog, OrderService, createProduct } from "@acme/core";
import { placeOrder } from "./handlers/orders";
import { listProducts } from "./handlers/products";

export interface RouterOptions {
  version: string;
}

export type RequestHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Uint8Array);
  }
  return chunks.length === 0 ? undefined : JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createRouter(options: RouterOptions): RequestHandler {
  const catalog = new Catalog();
  catalog.add(createProduct("p-1", "Ergonomic Keyboard", "Split mechanical keyboard with tenting kit and hot-swap sockets.", 18_900, 12));
  catalog.add(createProduct("p-2", "Standing Desk", "Electric sit-stand desk, 160 x 80 cm, with four memory presets.", 64_900, 3));
  catalog.add(createProduct("p-3", "Monitor Arm", "Gas spring arm for monitors up to 34 inches.", 12_900));
  const orders = new OrderService(catalog);

  return async (request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    switch (`${request.method ?? "GET"} ${url.pathname}`) {
      case "GET /health":
        sendJson(response, 200, { status: "ok", version: options.version });
        return;
      case "GET /products":
        sendJson(response, 200, listProducts(catalog, url.searchParams));
        return;
      case "POST /orders": {
        const result = placeOrder(orders, await readJson(request));
        sendJson(response, result.status, result.body);
        return;
      }
      default:
        sendJson(response, 404, { error: "not-found" });
    }
  };
}
