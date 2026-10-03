# simple-dependencies

A small command-line tool (`expense-report`) that summarizes expenses given as `amount:category[:description]`
arguments. It is the smallest realistic TypeScript project: an entry point, an application module, one service
and three utilities.

```text
src/index.ts                      entry point (bin), reads argv and environment
└── src/app.ts                    argument parsing and orchestration
    ├── src/services/expense-service.ts   aggregation and report lines
    │   └── src/utils/currency.ts         currency formatting
    │       └── src/utils/math.ts         rounding helpers
    └── src/utils/logger.ts               leveled console logger
```

## What it tests

- Parsing of ordinary TypeScript: a shebang line, classes with parameter properties and getters, interfaces,
  type aliases, arrow functions, default parameters, mixed value/type imports (`import { X, type Y }`).
- Resolution of extensionless relative specifiers (`moduleResolution: "Bundler"`), including `../` paths.
- The file dependency graph is a **tree**: every file except `src/index.ts` is imported by exactly one file,
  so there are no cycles and no diamonds.
- Depth computation: the longest import chain has **4 edges**
  (`index -> app -> services/expense-service -> utils/currency -> utils/math`).

## Expected conclusions

- 8 files (6 TypeScript sources, `package.json`, `tsconfig.json`); 5 import edges, all `static`.
- No externals (Node globals such as `process` and `console` are not imports), no unresolved imports.
- No file-level cycles; dependency depth 4.
- `src/index.ts` is the only source file without dependents; `src/utils/math.ts` and `src/utils/logger.ts`
  have no dependencies.
- `package.json` declares `bin: ./dist/index.js`; `dist/` does not exist, so the entry point maps back to
  `src/index.ts`.
