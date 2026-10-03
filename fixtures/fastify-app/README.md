# fastify-app

A Fastify 5 + TypeScript order intake API ("fulfillment-api"). ESM with `.js` import specifiers, a
module-scope application instance, JSON-schema validated routes, an encapsulated plugin mounted under a
version prefix, a functional service layer over MongoDB and an outgoing call to the ShipEngine rates API.

## Architecture

```text
src/
  server.ts                       entry point: app.addHook("onClose", closeDatabase), signals, top-level await app.listen()
  app.ts                          const app = fastify(...); app.register(cors); app.get("/health", healthHandler);
                                  app.register(ordersPlugin, { prefix: "/v1" }); app.route({ method: "POST", url: "/orders", ... })
  config.ts                       process.env["..."] reads (bracket access, noPropertyAccessFromIndexSignature)
  db.ts                           MongoClient, ordersCollection(), pingDatabase(), closeDatabase()
  plugins/orders.ts               default-exported async plugin: instance.addHook("onRequest", verifyApiKey),
                                  instance.get / instance.post / instance.route({ method: "DELETE", ... })
  handlers/orders.ts              route handlers (list, get, create, cancel)
  routes/health.ts                healthHandler
  hooks/auth.ts                   verifyApiKey (x-api-key header)
  schemas/order.schema.ts         JSON schemas plus the matching request types
  services/orders.service.ts      business rules; uses the repository through a namespace import
  services/pricing.ts             totals and VAT
  repositories/orders.repository.ts  MongoDB queries
  clients/shipping.client.ts      fetch("https://api.shipengine.com/v1/rates/estimate", { method: "POST", ... })
  errors.ts, types.ts             domain errors (with statusCode) and domain types
test/
  orders.test.ts                  node:test suite exercising the app with app.inject(...)
```

Layering: app/plugins -> handlers -> services -> repositories -> db, with the shipping client used by the
service layer. `routes/health.ts` reads the database directly.

## What it tests

- **Fastify detection** from `fastify()` (default import) assigned to a module-scope constant, and from
  plugin functions whose `FastifyInstance` parameter is the registration target.
- **Three registration styles**: shorthand methods with and without a route options argument
  (`app.get(path, handler)`, `instance.post(path, { schema }, handler)`), and full declarations
  (`app.route({ method, url, handler })`, `instance.route({ ... })`), with explicit type arguments
  (`instance.get<{ Params: OrderParams }>(...)`) that must not disturb argument analysis.
- **Prefix composition**: routes registered inside `ordersPlugin` are exposed under the `prefix` passed to
  `app.register(ordersPlugin, { prefix: "/v1" })`. The plugin reaches `app.ts` through a default import of a
  named default-exported function.
- **Encapsulation**: the `onRequest` hook added inside the plugin protects only the plugin's routes; the
  root-level `POST /orders` route carries its own `onRequest` route option; `GET /health` has no hook.
  `onClose` is an application hook registered in `server.ts` on the instance imported from `app.ts`.
- **Look-alikes that are not routes or plugins of this repository**: `app.register(cors, ...)` registers a
  third-party plugin without routes; `app.inject({ method, url })` in the test is a request, not a route.
- **Configuration, services and data**: bracket-notation environment reads, an outgoing HTTP call to
  `api.shipengine.com`, the `mongodb` datastore.
- **Import kinds and resolution**: `.js` specifiers resolving to `.ts`, `import type`, inline `type`
  specifiers in value imports, a namespace import (`import * as repository`), a test outside `src/`
  importing `../src/app.js`, and built-ins that exist only with the `node:` prefix (`node:test`).

## Expected conclusions

| Method | Path             | Handler                                       | Request hooks         |
| ------ | ---------------- | --------------------------------------------- | --------------------- |
| GET    | `/health`        | `src/routes/health.ts#healthHandler`          |                       |
| GET    | `/v1/orders`     | `src/handlers/orders.ts#listOrdersHandler`    | onRequest: verifyApiKey |
| GET    | `/v1/orders/:id` | `src/handlers/orders.ts#getOrderHandler`      | onRequest: verifyApiKey |
| POST   | `/v1/orders`     | `src/handlers/orders.ts#createOrderHandler`   | onRequest: verifyApiKey |
| DELETE | `/v1/orders/:id` | `src/handlers/orders.ts#cancelOrderHandler`   | onRequest: verifyApiKey |
| POST   | `/orders`        | `src/handlers/orders.ts#createOrderHandler`   | onRequest: verifyApiKey |

- `createOrderHandler` serves two routes: the versioned `POST /v1/orders` and the legacy root-level
  `POST /orders`.
- Environment variables (all in `config.ts`): `API_KEYS`, `CORS_ORIGINS`, `HOST`, `LOG_LEVEL`, `MONGO_DB`,
  `MONGO_URL`, `PORT`, `SHIPENGINE_API_KEY`. External service: `api.shipengine.com`. Datastore: `mongodb`.
- External packages: `@fastify/cors`, `fastify`, `mongodb`; built-ins `node:assert`, `node:test` (test only).
- No file-level import cycles. `test/orders.test.ts` is a test file depending on `src/app.ts`.

## expected.json conventions

- Symbol references are `<file>#<qualified name>` (a `sym:` identifier without the prefix).
- `routes`: `[METHOD, full path, handler]` after applying registration prefixes, sorted. Routes Fastify adds
  implicitly (`HEAD` for every `GET`) are not listed.
- `plugins`: `[plugin, prefix]` for plugins of this repository registered with `register`.
- `hooks`: distinct `[hook name, function]` pairs over all `addHook` calls and route-level hook options.
  `routeHooks`: `[METHOD, path, hook name, function]` for every request hook that applies to a route, either
  as a route option or through `addHook` in the plugin (encapsulation context) that registers the route.
- `envReads` and `httpCalls` are attributed to files; `httpCalls` is `[file, METHOD, URL]`.
- `manifestMain`: `[source file, declared path]` for the `package.json` `main` field, mapped from the build
  output back to the source (`dist/server.js` -> `src/server.ts`).
- Import `kind` is syntactic: `type` only for `import type` or when every specifier is marked `type`.
