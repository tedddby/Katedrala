export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code = "internal_error",
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`, 404, "not_found");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "validation_failed");
  }
}

export class UpstreamError extends AppError {
  constructor(service: string, status: number) {
    super(`${service} responded with HTTP ${status}`, 502, "upstream_failed");
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
