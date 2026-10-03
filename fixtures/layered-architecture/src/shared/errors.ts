export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(entity: string, id: string) {
    super(`${entity} ${id} was not found`, 404, "not_found");
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message, 422, "validation_failed");
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "conflict");
  }
}
