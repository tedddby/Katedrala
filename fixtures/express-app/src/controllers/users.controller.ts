import type { NextFunction, Request, Response } from "express";
import { userService } from "../container.js";
import { ValidationError } from "../errors.js";
import type { CreateUserInput } from "../models/user.js";

function parseCreateUserBody(body: unknown): CreateUserInput {
  if (typeof body !== "object" || body === null) {
    throw new ValidationError("request body must be a JSON object");
  }
  const { email, name } = body as Record<string, unknown>;
  if (typeof email !== "string" || typeof name !== "string") {
    throw new ValidationError("email and name are required");
  }
  return { email: email.trim().toLowerCase(), name: name.trim() };
}

export async function getUser(req: Request<{ id: string }>, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await userService.getById(req.params.id);
    res.json(user);
  } catch (error) {
    next(error);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await userService.register(parseCreateUserBody(req.body));
    res.status(201).location(`/api/users/${user.id}`).json(user);
  } catch (error) {
    next(error);
  }
}
