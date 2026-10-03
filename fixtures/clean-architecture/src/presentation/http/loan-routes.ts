import { BorrowBook } from "../../application/borrow-book.js";
import { ReturnBook } from "../../application/return-book.js";
import { BadRequestError, toErrorResponse } from "./error-mapper.js";
import { json, type HttpHandler, type HttpRequest, type Route } from "./http-types.js";

function withErrorHandling(handler: HttpHandler): HttpHandler {
  return async (request) => {
    try {
      return await handler(request);
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}

function stringField(request: HttpRequest, name: string): string {
  const body = request.body;
  const value = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[name] : undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new BadRequestError(`Field "${name}" must be a non-empty string`);
  }
  return value;
}

export function loanRoutes(borrowBook: BorrowBook, returnBook: ReturnBook): Route[] {
  return [
    {
      method: "POST",
      path: "/loans",
      handler: withErrorHandling(async (request) => {
        const loan = await borrowBook.execute({
          memberId: stringField(request, "memberId"),
          bookId: stringField(request, "bookId"),
        });
        return json(201, loan);
      }),
    },
    {
      method: "POST",
      path: "/loans/:id/return",
      handler: withErrorHandling(async (request) => json(200, await returnBook.execute(request.params.id ?? ""))),
    },
  ];
}
