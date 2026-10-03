import {
  BookUnavailableError,
  DomainError,
  LoanAlreadyClosedError,
  LoanLimitReachedError,
  NotFoundError,
} from "../../domain/model/errors.js";
import { json, type HttpResponse } from "./http-types.js";

export class BadRequestError extends Error {}

/** Translates errors raised by use cases into HTTP responses. */
export function toErrorResponse(error: unknown): HttpResponse {
  if (error instanceof BadRequestError) {
    return json(400, { error: "bad-request", message: error.message });
  }
  if (error instanceof NotFoundError) {
    return json(404, { error: error.code, message: error.message });
  }
  if (
    error instanceof BookUnavailableError ||
    error instanceof LoanLimitReachedError ||
    error instanceof LoanAlreadyClosedError
  ) {
    return json(409, { error: error.code, message: error.message });
  }
  if (error instanceof DomainError) {
    return json(422, { error: error.code, message: error.message });
  }
  return json(500, { error: "internal-error" });
}
