# layered-architecture

`shop-backend`, an order/payment/user API organized **by technical layer**, the way many Node.js backends
are: one directory per layer, with every business feature spread across all of them. The HTTP plumbing is
built on `node:http` (no framework), persistence uses `pg`, and payments go through an external HTTP API.

```text
src/
├── controllers/   order.controller.ts  payment.controller.ts  user.controller.ts
├── services/      order.service.ts     payment.service.ts     user.service.ts   payment-gateway.ts
├── repositories/  order.repository.ts  payment.repository.ts  user.repository.ts
├── models/        order.ts  order-line.ts  payment.ts  user.ts
├── shared/        config.ts  database.ts  errors.ts  http.ts  logger.ts
└── main.ts        composition root: builds repositories, services and controllers by hand
```

Shared code is imported through the tsconfig path alias `@/*` -> `./src/*` (no `baseUrl`), everything else
through relative paths.

## What it tests

- **Logical modules cut across directories.** The physical components are the layer directories; the logical
  modules are the features. Katedrala should infer `payments`, `orders` and `users` from naming
  (`payment.*`, `payment-gateway`, `order.*`, `order-line`, `user.*`) and dependency cohesion, plus a
  `shared` module, rather than equating modules with directories.
- **Layer inference** from directory names and dependency direction: controllers -> services ->
  repositories -> models, with services also using models directly. There is no upward dependency, no
  controller -> repository or controller -> model shortcut, and models depend on nothing outside `models/`.
- **Inter-module dependencies** that are acyclic: orders -> payments -> users, orders -> users, and every
  feature -> shared. `shared` depends on no feature.
- Resolution of tsconfig `paths` without `baseUrl`, extensionless relative imports, `import type`, mixed
  value/type imports.

## Expected conclusions

- 22 files (20 TypeScript sources, `package.json`, `tsconfig.json`); 51 imports, no cycles, no unresolved
  imports; externals `node:crypto`, `node:http`, `pg`.
- Inferred modules (as listed in `expected.json` under `logicalModules`):
  - payments: `controllers/payment.controller.ts`, `services/payment.service.ts`,
    `services/payment-gateway.ts`, `repositories/payment.repository.ts`, `models/payment.ts`
  - orders: `controllers/order.controller.ts`, `services/order.service.ts`,
    `repositories/order.repository.ts`, `models/order.ts`, `models/order-line.ts`
  - users: `controllers/user.controller.ts`, `services/user.service.ts`, `repositories/user.repository.ts`,
    `models/user.ts`
  - shared: the five files in `src/shared/`
- `src/main.ts` (composition root) imports from every layer and must not be placed in any of the four
  modules above; whether it forms its own module or stays unassigned is not constrained.
- Layers in rank order: controllers, services, repositories, models (`expected.json` uses the directory
  names; an analyzer may name them by role, e.g. `controller`, `service`, `repository`, `model`).
  `src/shared/` and `src/main.ts` belong to no layer.
- Layer-level dependencies are exactly `controllers -> services`, `services -> repositories`,
  `services -> models`, `repositories -> models`; all point downward, so no layering anomaly is expected.
