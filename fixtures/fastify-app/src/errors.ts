// Fastify's default error handler uses `statusCode` to choose the response status.

export class OrderNotFoundError extends Error {
  readonly statusCode = 404;

  constructor(readonly orderId: string) {
    super(`Order ${orderId} not found`);
    this.name = "OrderNotFoundError";
  }
}

export class OrderStateError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "OrderStateError";
  }
}

export class UpstreamError extends Error {
  readonly statusCode = 502;

  constructor(service: string, status: number) {
    super(`${service} responded with HTTP ${status}`);
    this.name = "UpstreamError";
  }
}
