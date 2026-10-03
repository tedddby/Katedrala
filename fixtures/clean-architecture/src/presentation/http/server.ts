import { createServer, type IncomingMessage, type Server } from "node:http";
import { json, type HttpResponse, type Route } from "./http-types.js";

function matchPath(pattern: string, path: string): Record<string, string> | null {
  const expected = pattern.split("/").filter(Boolean);
  const actual = path.split("/").filter(Boolean);
  if (expected.length !== actual.length) {
    return null;
  }
  const params: Record<string, string> = {};
  for (const [index, segment] of expected.entries()) {
    const value = actual[index] ?? "";
    if (segment.startsWith(":")) {
      params[segment.slice(1)] = decodeURIComponent(value);
    } else if (segment !== value) {
      return null;
    }
  }
  return params;
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  let text = "";
  for await (const chunk of request) {
    text += String(chunk);
  }
  return text === "" ? undefined : JSON.parse(text);
}

export function startHttpServer(routes: Route[], port: number): Server {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    let response: HttpResponse = json(404, { error: "not-found" });

    for (const route of routes) {
      const params = route.method === req.method ? matchPath(route.path, url.pathname) : null;
      if (params === null) {
        continue;
      }
      try {
        const body = await readBody(req);
        response = await route.handler({ method: route.method, path: url.pathname, params, body });
      } catch {
        response = json(400, { error: "invalid-json" });
      }
      break;
    }

    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(JSON.stringify(response.body));
  });
  server.listen(port);
  return server;
}
