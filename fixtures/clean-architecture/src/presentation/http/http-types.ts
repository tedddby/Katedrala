export interface HttpRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  body: unknown;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export type HttpHandler = (request: HttpRequest) => Promise<HttpResponse>;

export interface Route {
  method: "GET" | "POST";
  path: string;
  handler: HttpHandler;
}

export function json(status: number, body: unknown): HttpResponse {
  return { status, body };
}
