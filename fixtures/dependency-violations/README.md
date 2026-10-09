# dependency-violations

A small Express + PostgreSQL order backend with a `katedrala.config.yaml` that declares two selector groups,
two modules and three rules. The code breaks exactly two of the rules, each in exactly one place. Everything
else follows the intended layering, so the fixture tests both that violations are found and that nothing
else is reported.

## Architecture

```text
src/main.ts                composition root: builds repositories, services, controllers; registers routes
src/config.ts              environment configuration
src/domain/                order.ts, customer.ts: plain types and pure helpers
src/controllers/           HTTP handlers           -> services (and, once, a repository)
src/services/              application services    -> repositories, payments, analytics, domain
src/repositories/          PostgreSQL access (pg)  -> domain, database.ts
src/payments/              module "payments":  checkout.ts, refunds.ts, payment-gateway.ts
src/analytics/             module "analytics": tracker.ts, events.ts
```

The intended flow is `controllers -> services -> repositories`. `payments` should be usable without
`analytics`. The two shortcuts:

1. `src/controllers/order.controller.ts` imports `OrderRepository` and calls `findById` directly in
   `OrderController.show` (marked with a `TODO(perf)` comment), bypassing `OrderService`.
2. `src/payments/checkout.ts` imports `track` from `src/analytics/tracker.ts` and calls it three times in
   `CheckoutService.pay`.

`customer.controller.ts` and `refund.controller.ts` only use services. `refunds.ts` and `payment-gateway.ts`
do not touch analytics. Services may use analytics: `order.service.ts` and `refund.service.ts` receive a
`Tracker` by constructor injection, and that is allowed.

## What it tests

- Rule configuration: `groups` and `modules` selectors (globs), `from` and `module` sources,
  `cannot_depend_on` targets, and a `no_cycles` rule with `scope: modules`.
- Violations are reported between files, with the import and call evidence from the offending file.
- Transitive paths are not violations. Every controller reaches repositories through services, and
  `src/main.ts` (which belongs to no group) imports everything.
- Type-only imports still count as dependencies (`repositories/*.ts` import `type { Database }`). They
  create no extra violations here.
- No false module-cycle warning. The only dependency between the declared modules is
  `payments -> analytics`.

## Expected conclusions

- Exactly two violations:
  - `controllers-no-database` (error): `src/controllers/order.controller.ts` -> `src/repositories/order.repository.ts`
  - `payments-isolation` (error): `src/payments/checkout.ts` -> `src/analytics/tracker.ts`
- `no-module-cycles`: 0 violations.
- `controllers` matches the 3 files in `src/controllers`, `repositories` matches the 3 files in
  `src/repositories`, `payments` has 3 files and `analytics` has 2.
- File-level graph: acyclic, 40 resolved import statements, externals `express`, `pg` and `node:crypto`.
- Express is recognized (routes are registered in `createApp` in `src/main.ts`).

## `expected.json` expectations

| Key                          | Meaning                                                                                                   |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `violations`                 | The complete set of rule violations, as `{ rule, source, target }` with file paths. Nothing else may be reported. |
| `violationCountByRule`       | Number of violations per configured rule id, including rules with none.                                   |
| `groups`                     | Files matched by each selector under `groups`.                                                             |
| `declaredModules`            | Member files of each module declared under `modules`.                                                      |
| `declaredModuleDependencies` | `[from, to]` pairs of declared modules where a file of `from` imports a file of `to`.                     |
| `moduleCycles`               | Cycles between declared modules (none). Inferred modules may form cycles; they are observations, not rule violations. |
