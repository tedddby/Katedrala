# clean-architecture

`library-lending`, a book lending service written in the ports-and-adapters ("clean architecture") style.
The domain owns its entities and the interfaces (ports) it needs; use cases depend only on the domain;
adapters implement ports; one composition root wires everything. NodeNext ESM resolution (`.js`
specifiers for `.ts` files) and `verbatimModuleSyntax`.

```text
src/
├── domain/
│   ├── model/          book.ts  loan.ts  member.ts  errors.ts      entities, value types, domain errors
│   ├── ports/          book-repository.ts  loan-repository.ts  member-repository.ts  clock.ts  notifier.ts
│   └── index.ts        barrel: re-exports model and ports
├── application/        borrow-book.ts  return-book.ts  send-overdue-reminders.ts  dto.ts   (use cases)
├── infrastructure/     persistence/{pool, sql-book-repository, sql-loan-repository, sql-member-repository}.ts
│                       notifications/smtp-notifier.ts  system-clock.ts                 (port implementations)
├── presentation/http/  http-types.ts  error-mapper.ts  loan-routes.ts  server.ts       (HTTP adapter)
└── main.ts             composition root
```

## Dependency rule

```text
presentation ──► application ──► domain ◄── infrastructure
      └──────────────────────────►┘
main.ts ──► application, infrastructure, presentation
```

- `domain` imports nothing outside `src/domain/` and no external package.
- `application` imports only `domain` (always through the barrel `src/domain/index.ts`).
- `infrastructure` imports only `domain` (plus `pg`, `nodemailer`, `node:crypto`): four adapters import
  ports and entities directly, `sql-member-repository.ts` imports its port through the barrel.
- `presentation` imports `application` (use case classes) and `domain` (error classes, for HTTP status
  mapping). Both point inward, which the dependency rule allows.
- Nothing imports `src/main.ts`. Outside `infrastructure` itself, only `src/main.ts` imports `infrastructure`.

## What it tests

- Layer inference for a clean/hexagonal architecture: `presentation` (outermost) -> `application` ->
  `domain` (innermost), with `infrastructure` as an outer adapter ring that depends only on `domain`.
- `implements` edges from adapter classes to port interfaces, including one resolved through a
  re-export chain (`export * from "./ports/member-repository.js"`).
- Barrel files: nine `export ... from` statements in `src/domain/index.ts`; interfaces-only modules
  re-exported with `export *`.
- The composition root is recognized as such (it depends on every layer and nothing depends on it) rather
  than flagged as a layering problem.

## Expected conclusions

- 27 files (25 TypeScript sources, `package.json`, `tsconfig.json`); 57 imports; externals `node:crypto`,
  `node:http`, `nodemailer`, `pg`; no unresolved imports.
- No file-level cycles and no directory-level cycles (entities live in `domain/model/` so that the
  barrel in `domain/` and the ports in `domain/ports/` do not form a directory cycle).
- Layer-level dependencies are exactly `application -> domain`, `infrastructure -> domain`,
  `presentation -> application`, `presentation -> domain`. All point inward: with layer rules expressing
  the dependency rule, there are zero violations, and no upward-dependency anomaly is expected.
- Five `implements` relationships (adapter -> port), listed in `expected.json` as `<path>#<Class>` pairs
  (the IR symbol ids without the `sym:` prefix).
- The domain depends on nothing internal outside itself and on no external package.
