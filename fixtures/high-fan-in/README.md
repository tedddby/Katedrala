# high-fan-in

An Express + PostgreSQL shop service with HTTP routes, application services, background jobs and a storage
layer. Every module-level component creates its own scoped logger with `createLogger("<scope>")` from
`src/core/logger.ts`. That makes the logger the most depended-upon file in the system.

## Architecture

```text
src/main.ts            composition root (does not log itself; startup failures go to console.error)
src/core/logger.ts     structured logger: Logger class, createLogger, sinks, levels   <- 20 importers
src/core/errors.ts     AppError hierarchy                                              <- 7 importers
src/core/config.ts     environment configuration
src/api/               server.ts, router.ts, auth.middleware.ts, users.routes.ts, orders.routes.ts
src/services/          user, order, payment, email, inventory services
src/jobs/              scheduler.ts and four jobs (nightly report, stale orders, inventory sync, e-mail digest)
src/storage/           database.ts (pg pool), cache.ts (TTL cache), user/order/product stores
```

Each of the 20 files in `src/api`, `src/services`, `src/jobs` and `src/storage` contains exactly one
`import { createLogger } from "../core/logger"`. It is a value import, and the logger is used in the file.
Neither `src/main.ts` nor the other `src/core` files import the logger. The logger itself imports nothing.

## What it tests

- Fan-in (afferent coupling) at file level: the number of distinct files that import a file.
- Ranking: the logger is clearly the top file. The runner-up is `src/core/errors.ts` with 7 importers, and
  every other file has at most 4.
- Martin instability for a leaf utility: Ce = 0 and Ca = 20, so I = 0 (maximally stable).
- Classification of a widely used, small, dependency-free utility. It is a stable foundation and should not
  be reported as a god component (it is small and has no fan-out). A component-level view should show
  `src/core` as the most depended-upon component.
- The count is the same with or without type-only imports, because every logger import is a value import.

## Expected conclusions

- Highest file fan-in: `src/core/logger.ts` with 20 dependents: 5 in `src/api`, 5 in `src/services`, 5 in
  `src/jobs` and 5 in `src/storage`.
- `src/core/errors.ts` comes second with 7. No other file has a fan-in above 7.
- The logger has fan-out 0 and instability 0.
- The graph is acyclic.

## `expected.json` expectations

Fan-in is the number of distinct fixture files with at least one import that resolves to the file. Fan-out
is the number of distinct fixture files the file imports. Externals are not counted.

| Key                          | Meaning                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `highestFanIn`, `fanIn`      | The file with the highest fan-in, and that fan-in.                              |
| `loggerImporters`            | The 20 files that import `src/core/logger.ts`.                                  |
| `loggerImportersByDirectory` | How many of them are in each directory.                                         |
| `loggerFanOut`               | Fan-out of the logger.                                                          |
| `loggerInstability`          | Martin instability Ce / (Ca + Ce) of the logger at file level.                  |
| `runnerUp`                   | The file with the second-highest fan-in, and its fan-in.                        |
| `maxFanInOfOtherFiles`       | Highest fan-in of any file other than the logger.                               |
