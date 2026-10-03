# express-app

A small production-style Express 5 + TypeScript REST API ("orders-api") for users and orders. ESM with
`.js` import specifiers (`NodeNext`), one router per resource, controller functions, service and repository
classes wired by hand in a composition root, PostgreSQL through `pg`, bearer-token auth middleware and an
outgoing call to the Stripe API.

## Architecture

```text
src/
  server.ts                  entry point: dotenv, app.listen(config.port), graceful shutdown
  app.ts                     createApp(): express(), global middleware, GET /health, app.use("/api", router)
  config.ts                  reads PORT, DATABASE_URL, STRIPE_SECRET_KEY, AUTH_TOKEN_SECRET
  logger.ts                  JSON line logger (reads LOG_LEVEL)
  container.ts               composition root: repositories -> services (manual dependency injection)
  errors.ts                  HttpError hierarchy rendered by errorHandler
  db/pool.ts                 import { Pool } from "pg"; the shared connection pool
  routes/index.ts            API router: router.use(usersRouter), router.use(ordersRouter)
  routes/users.routes.ts     default-exported Router: GET /users/me (inline handler), GET /users/:id, POST /users
  routes/orders.routes.ts    named Router `ordersRouter`: POST /orders, GET /orders/:id, both behind authMiddleware
  controllers/               request handlers; controllers/index.ts is a barrel (export * / export { ... } from)
  services/                  UserService, OrderService: business rules
  repositories/              UserRepository, OrderRepository: SQL over the pg Pool
  clients/stripe.client.ts   fetch("https://api.stripe.com/v1/charges", { method: "POST", ... })
  middleware/                authMiddleware (HMAC bearer tokens via node:crypto), requestLogger, errorHandler, notFoundHandler
  models/                    domain types plus two values (USER_ROLES, orderTotal)
  types/express.d.ts         global augmentation of Express.Request with `user`
```

Layering: routes -> controllers -> services -> repositories -> db. Controllers obtain services from the
composition root (`container.ts`), which is the only file that instantiates services, repositories and the
Stripe client. One deliberate shortcut exists: `controllers/health.controller.ts` queries the pool directly,
skipping the service and repository layers.

## What it tests

- **Express application and router detection**: `express()` called inside a factory function (`createApp`),
  `Router()` instances exported as default (`users.routes.ts`) and by name (`orders.routes.ts`).
- **Route path composition across three levels**: `app.use("/api", router)` -> `router.use(usersRouter)`
  (no path) -> `usersRouter.get("/users/:id", getUser)` gives `GET /api/users/:id`. Routers reach `app.ts`
  through default and named imports.
- **Handler resolution through imports and a barrel**: `getUser`/`createUser` and `healthCheck` are imported
  from `controllers/index.ts` (`export *`), `createOrder`/`getOrder` directly from their module. Handlers are
  reported at their declarations, never at the barrel.
- **Inline handler at file scope**: `GET /users/me` uses an arrow function that is not a declared symbol, so the
  handler is the file `src/routes/users.routes.ts`.
- **Middleware**: route-level (`authMiddleware` before the handler), global (`app.use(requestLogger)`),
  terminal and error-handling middleware (`notFoundHandler`, four-parameter `errorHandler`). Routers passed to
  `use` are mounts, not middleware. `express.json()` is third-party middleware and is not listed.
- **Configuration, services and data**: environment reads in three files, one outgoing HTTP call
  (`api.stripe.com`), the `pg` datastore.
- **Import kinds**: `import type`, inline `type` specifiers inside a value import (`static`), separate value
  and type imports of the same module in one file (two entries), re-exports, a side-effect import of an
  external subpath (`dotenv/config` -> package `dotenv`), `.js` specifiers resolving to `.ts`, and a type
  import from a declaration file (`types/express.d.ts`).

## Expected conclusions

| Method | Path              | Handler                                               | Route middleware |
| ------ | ----------------- | ----------------------------------------------------- | ---------------- |
| GET    | `/health`         | `src/controllers/health.controller.ts#healthCheck`    |                  |
| GET    | `/api/users/me`   | `src/routes/users.routes.ts` (inline arrow function)  | `authMiddleware` |
| GET    | `/api/users/:id`  | `src/controllers/users.controller.ts#getUser`         |                  |
| POST   | `/api/users`      | `src/controllers/users.controller.ts#createUser`      |                  |
| POST   | `/api/orders`     | `src/controllers/orders.controller.ts#createOrder`    | `authMiddleware` |
| GET    | `/api/orders/:id` | `src/controllers/orders.controller.ts#getOrder`       | `authMiddleware` |

- Middleware: `authMiddleware`, `requestLogger`, `notFoundHandler`, `errorHandler`.
- Environment variables: `AUTH_TOKEN_SECRET`, `DATABASE_URL`, `PORT`, `STRIPE_SECRET_KEY` (all in
  `config.ts`), `LOG_LEVEL` (`logger.ts`), `NODE_ENV` (`middleware/error-handler.ts`).
- External service: `api.stripe.com` (`POST https://api.stripe.com/v1/charges` from `StripeClient.createCharge`).
- Datastore: `pg`. External packages: `dotenv`, `express`, `pg`, built-in `node:crypto`.
- No file-level import cycles. `container.ts` is the hub of the runtime wiring; `errors.ts`, `logger.ts`
  and `models/*` are widely used leaves.

## expected.json conventions

- Symbol references are `<file>#<qualified name>` (a `sym:` identifier without the prefix). A handler that is
  not a declared symbol (an inline function at file scope) is referenced by its file path.
- `routes`: `[METHOD, full path, handler]`, full paths after composing every mount prefix, sorted. Implicit
  `HEAD` handling of `GET` routes is not listed.
- `routeMiddleware`: middleware passed before the handler in a route registration (global middleware is not
  repeated per route). `middleware`: every fixture symbol used as middleware. `routers`: each `Router()`
  instance with its effective mount path.
- `envReads` and `httpCalls` are attributed to files; `httpCalls` is `[file, METHOD, URL]`.
- `manifestMain`: `[source file, declared path]` for the `package.json` `main` field, mapped from the build
  output back to the source (`dist/server.js` -> `src/server.ts`).
- Import `kind` is syntactic: `type` only for `import type` or when every specifier is marked `type`.
