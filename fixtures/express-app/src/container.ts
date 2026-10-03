// Composition root: the only place that knows how repositories, clients and services are wired together.
import { StripeClient } from "./clients/stripe.client.js";
import { config } from "./config.js";
import { pool } from "./db/pool.js";
import { OrderRepository } from "./repositories/order.repository.js";
import { UserRepository } from "./repositories/user.repository.js";
import { OrderService } from "./services/order.service.js";
import { UserService } from "./services/user.service.js";

const userRepository = new UserRepository(pool);
const orderRepository = new OrderRepository(pool);
const stripeClient = new StripeClient(config.stripeSecretKey);

export const userService = new UserService(userRepository);
export const orderService = new OrderService(orderRepository, userService, stripeClient);
