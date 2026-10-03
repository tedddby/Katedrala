import { Router } from "express";
import { createUser, getUser } from "../controllers/index.js";
import { authMiddleware } from "../middleware/auth.js";

const router = Router();

// Registered before "/users/:id" so that "me" is not captured as an id.
router.get("/users/me", authMiddleware, (req, res) => {
  res.json(req.user);
});
router.get("/users/:id", getUser);
router.post("/users", createUser);

export default router;
