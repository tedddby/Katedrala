/** An error that maps directly to an HTTP response. Rendered by `errorHandler`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string = "http_error",
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends HttpError {
  constructor(resource: string, id: string) {
    super(404, `${resource} ${id} not found`, "not_found");
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = "Authentication required") {
    super(401, message, "unauthorized");
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(400, message, "validation_failed");
  }
}

export class PaymentFailedError extends HttpError {
  constructor(message: string) {
    super(402, message, "payment_failed");
  }
}
