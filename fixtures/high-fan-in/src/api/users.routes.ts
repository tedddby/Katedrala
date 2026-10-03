import { Router } from "express";
import { createLogger } from "../core/logger";
import type { UserService } from "../services/user.service";

const log = createLogger("api.users");

export function userRoutes(users: UserService): Router {
  const router = Router();

  router.post("/", async (req, res, next) => {
    try {
      const { email, name } = req.body as { email: string; name: string };
      const user = await users.register(email, name);
      log.info("user created", { id: user.id });
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      res.json(await users.get(req.params.id));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
