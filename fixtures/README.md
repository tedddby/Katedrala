# Fixtures

Small but realistic repositories used as inputs for Katedrala's tests: parsing, module resolution, the
dependency graph, cycles, module and layer inference, metrics, anomalies, rules, impact, diff and framework
detection. Each fixture is a self-contained project as a developer would write it: functions with bodies that
call each other, classes with methods, meaningful types, `package.json` and `tsconfig.json`.

Fixtures are analyzer inputs, so their exact bytes matter (hashes, line counts, positions):

- LF line endings (enforced by `.gitattributes`), UTF-8 without byte-order mark, trailing newline.
- Excluded from Prettier (`.prettierignore`), ESLint, type checking and Vitest. Do not reformat them.
- No `node_modules/` and no build output (`dist/`). Code does not need to run, and third-party packages are
  not installed. It must be syntactically valid unless a fixture's README says otherwise.

## Index

| #   | Fixture                                                  | What it models                                                                                                                                       |
| --- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [simple-dependencies](simple-dependencies/)              | Six-file TypeScript CLI whose imports form a tree of depth 4; the baseline for parsing, extensionless resolution and an acyclic graph.               |
| 2   | [circular-dependencies](circular-dependencies/)          | Kanban domain library with a 3-file and a 2-file runtime cycle and a 2-file cycle formed only by `import type`; NodeNext `.js` specifiers.            |
| 3   | [layered-architecture](layered-architecture/)            | Backend organized by layer directories (controllers, services, repositories, models) whose feature modules payments, orders and users cut across them. |
| 4   | [clean-architecture](clean-architecture/)                | Ports-and-adapters service: domain entities and ports, use cases, adapters implementing ports, HTTP presentation, composition root; no violations.    |
| 5   | [monorepo](monorepo/)                                    | pnpm workspace with four packages: unbuilt `dist` entry points mapped to `src`, a tsconfig `paths` deep import, a JSON import, a phantom `lodash`.    |
| 6   | [tangled-architecture](tangled-architecture/)            | Five feature directories importing each other in both directions: one directory-level cycle, four file-level cycles, high coupling.                  |
| 7   | [dependency-violations](dependency-violations/)          | Express + PostgreSQL backend with a `katedrala.config.yaml` (groups, modules, three rules) that the code breaks in exactly two places.                |
| 8   | [high-fan-in](high-fan-in/)                              | Shop service in which a small logger utility is imported by 20 files: highest fan-in, instability 0, not a god component.                           |
| 9   | [high-fan-out](high-fan-out/)                            | Queue worker whose orchestrator imports 20 services and adapters: highest fan-out, a god-component candidate.                                        |
| 10  | [ambiguous-boundaries](ambiguous-boundaries/)            | Feature-organized shop with three misplaced files and a grab-bag `common/` directory: inferred modules disagree with directories.                   |
| 11  | [javascript-commonjs](javascript-commonjs/)              | Express to-do app in plain JavaScript (CommonJS): `require` forms, `module.exports`/`exports`, `.cjs`/`.mjs`/`.json`, JSX in `.js`, a non-literal `require`. |
| 12  | [typescript-features](typescript-features/)              | Orders/billing library exercising TypeScript language and resolution edge cases: barrels, decorators, ambient declarations, JSON and lazy imports. |
| 13  | [express-app](express-app/)                              | Express 5 REST API: application and router detection, route paths composed across three levels, middleware, environment reads, outgoing HTTP calls. |
| 14  | [nestjs-app](nestjs-app/)                                | NestJS 11 + TypeORM service: modules, controllers, providers, dependency injection, entities, guards, a Jest spec.                                   |
| 15  | [fastify-app](fastify-app/)                              | Fastify 5 API: three route registration styles, an encapsulated plugin under a prefix, hooks, MongoDB, an outgoing HTTP call.                       |

Each fixture directory contains the repository itself plus two files that are not part of it:

- `README.md`: the architecture the fixture models, what it tests and the conclusions Katedrala should reach.
- `expected.json`: machine-readable ground truth asserted by tests (format below).

## `expected.json`

```ts
type ImportKind =
  | "static" | "type" | "dynamic" | "require" | "re-export" | "side-effect" | "import-equals" | "triple-slash";

interface FixtureExpectation {
  /** One sentence describing the fixture. */
  description: string;
  /** Number of files in the fixture directory, excluding README.md and expected.json at its root. */
  files: number;
  /** Every import statement that resolves to another file of the fixture: [from, to, kind]. */
  imports: Array<[from: string, to: string, kind: ImportKind]>;
  /** Distinct third-party packages and platform built-ins imported anywhere in the fixture. */
  externals: string[];
  /** Imports that must not resolve to a fixture file and are not externals: [from, specifier]. */
  unresolved: Array<[from: string, specifier: string]>;
  /** File-level strongly connected components with more than one file, over all import kinds. */
  fileCycles: string[][];
  /** Fixture-specific ground truth; every key is defined in the fixture's README.md. */
  expectations: Record<string, unknown>;
}
```

### Conventions

- **Paths** are POSIX, relative to the fixture root, without a leading `./` (as in the IR, see
  [docs/IR.md](../docs/IR.md#conventions)).
- **Symbols** are written `<path>#<qualified name>`, the IR symbol identifier without its `sym:` prefix
  (`src/infrastructure/system-clock.ts#SystemClock`).
- **Ordering.** Strings are compared by UTF-16 code units (`compareStrings` in `@katedrala/ir`, no locale).
  Arrays of strings are sorted; arrays of tuples are sorted element by element (`from`, then `to`, then
  `kind`). Members of each cycle are sorted, and cycles are sorted by the same rule. Arrays inside
  `expectations` are sorted the same way unless their order carries meaning: `layers` lists layers from the
  outermost (rank 0) inwards, and chains such as `longestChain` are in path order.
- **`files`** counts every file, including `package.json`, `tsconfig.json`, `katedrala.config.yaml`,
  workspace manifests and dot-files such as `.gitignore`.

### `imports`

One entry per import statement, or per call expression for `import()` and `require()`. A file importing the
same target twice with different kinds (for example `import type { A }` and `export { B } from` the same
module) has two entries. Only literal specifiers are listed. The kind is derived from syntax:

| Kind            | Syntax                                                                                                    | IR `ImportEntry`                 |
| --------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `static`        | `import x from`, `import { a } from`, `import * as ns from`, including mixed `import { a, type B } from`   | `static`, `typeOnly: false`      |
| `type`          | `import type ...`; `import { type A, type B } from` (every binding type-only); `export type { A } from`; `import type x = require()`; `import("x").T` in a type position | any kind except `type-reference`, `typeOnly: true` |
| `side-effect`   | `import "./x"`                                                                                            | `side-effect`                    |
| `dynamic`       | `import("./x")` in an expression                                                                          | `dynamic`                        |
| `require`       | `require("./x")`                                                                                          | `require`                        |
| `re-export`     | `export * from`, `export * as ns from`, `export { a } from`, including mixed `export { a, type B } from`  | `re-export`, `typeOnly: false`   |
| `import-equals` | `import x = require("./x")`                                                                               | `import-equals`, `typeOnly: false` |
| `triple-slash`  | `/// <reference path="./x.d.ts" />`                                                                       | `type-reference`                 |

In short: a triple-slash reference is `triple-slash`; any other entry that is erased at runtime is `type`;
everything else keeps its syntactic kind.

### Resolution semantics

`imports`, `externals` and `unresolved` assume TypeScript/Node resolution as follows:

1. **Relative specifiers** (`./`, `../`) resolve against the importing file with extension probing
   (`.ts`, `.tsx`, `.d.ts`, `.js`, `.jsx`, `.mts`, `.cts`, `.d.mts`, `.d.cts`, `.mjs`, `.cjs`) and
   directory `index` files. An ESM `.js`/`.jsx`/`.mjs`/`.cjs` specifier may refer to the corresponding
   `.ts`/`.tsx`/`.mts`/`.cts` source. `.json` is never appended implicitly: a JSON file resolves only when
   the specifier names it, except for `require()` in JavaScript files, which (like Node's CommonJS loader)
   tries `.json` after the code extensions and before the directory (and `index.json` after the code
   `index` files).
2. **tsconfig `paths`** (from the nearest `tsconfig.json`, following `extends`) apply before `baseUrl`.
   Without `baseUrl`, `paths` values are relative to the configuration file that declares them.
3. **Workspace packages** (`package.json` files inside the fixture) resolve by name to the package's source
   entry. `exports`, `main` and `types` that point into a `dist/` directory that does not exist map back to
   `src/` (`./dist/index.js` -> `src/index.ts`); `src/index.ts` is the fallback. A subpath that the package's
   `exports` does not export does not resolve this way (only `paths` can make it resolve).
4. **Built-ins** (`fs`, `node:fs`, ...) are externals written `node:<name>`. Any other bare specifier is a
   third-party external named by its package (`react-dom/client` -> `react-dom`, `@scope/pkg/sub` ->
   `@scope/pkg`), including type-only imports. An external is listed whether or not a manifest declares it.
5. Anything else is **unresolved**, for example an import of a generated file that is not committed.
   A non-literal specifier (`require(pluginPath)`) never resolves; it is listed in `unresolved` with the
   specifier's source text (`pluginPath`).

`fileCycles` uses all import kinds, including `type` and `dynamic`. Fixtures that distinguish cycles
surviving at runtime list them under `expectations.runtimeCycles`: the strongly connected components of
the graph without `type` edges.

### Recurring `expectations` keys

Each fixture's README defines its keys. These keys mean the same thing wherever they appear:

| Key                       | Meaning                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `runtimeCycles`           | File-level SCCs (more than one file) when `type` imports are excluded.                                     |
| `typeOnlyCycles`          | File-level SCCs whose internal edges are all `type`; they disappear when type-only imports are excluded.   |
| `directoryCycles`         | SCCs of the directory graph: directory A depends on B when a file directly in A imports a file directly in B (A != B). |
| `directoryDependencies`   | All edges of that directory graph, as `[from, to]`.                                                        |
| `layers`                  | Expected layer names, outermost (rank 0) first.                                                            |
| `layerDirectories`        | The directory that holds each layer's files.                                                               |
| `layerDependencies`       | `[from, to]` layer pairs with at least one import from a file of `from` to a file of `to`.                |
| `logicalModules`          | Expected inferred modules, name -> sorted member files. Files not listed are unconstrained unless stated.  |
| `packageDependencies`     | Code-level dependencies between workspace packages (some import crosses the package boundary).            |

## Adding a fixture

1. Write the repository as a developer would: realistic names, working logic, no placeholder code.
2. Add `README.md` and `expected.json`. List every resolving import, external and unresolved import, and
   every expectation the fixture is meant to test, precisely enough to assert.
3. Re-read every file's import statements and check `expected.json` against them: counts, kinds, sorting,
   cycles. Ideally check the code with a TypeScript parser as well.
4. Check the bytes: LF line endings only (no `\r`), no byte-order mark, a trailing newline. Then add the
   fixture to the index above.
