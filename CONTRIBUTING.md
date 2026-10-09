# Contributing to Katedrala

Thank you for helping build Katedrala. This guide covers the development setup, the standards every change
must meet and how the repository is organized. Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first.

## Setup

Requirements: Node.js ≥ 22.12 and pnpm 11 (`corepack enable`, or install pnpm directly).

```bash
pnpm install
pnpm check        # typecheck + build, lint, formatting, schema freshness, tests
```

| Command              | What it does                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `pnpm build`         | Build every package (`tsc -b`, project references)                            |
| `pnpm typecheck`     | Build, then type-check sources, tests and benchmarks together                 |
| `pnpm test`          | Run all tests (Vitest); workspace packages resolve to their TypeScript source |
| `pnpm test:coverage` | Tests with V8 coverage                                                        |
| `pnpm lint`          | ESLint with type-aware rules                                                  |
| `pnpm format`        | Format with Prettier                                                          |
| `pnpm schema`        | Regenerate JSON Schemas from the IR types (commit the result)                 |
| `pnpm clean`         | Remove build output                                                           |

## Repository layout

```text
packages/        one directory per published package (see docs/ARCHITECTURE.md#packages)
  <name>/src/    sources; unit tests live next to the code as *.test.ts
fixtures/        small repositories used as analyzer inputs (byte-exact, LF line endings)
tests/           cross-package integration, CLI and schema-stability tests
benchmarks/      benchmark harness, synthetic repository generator, recorded results
docs/            documentation
examples/        configuration and API usage examples
scripts/         repository maintenance scripts
```

Each package has two TypeScript configurations: `tsconfig.build.json` (emits `dist/`, excludes tests, declares
project references) and `tsconfig.json` (editor and lint configuration including tests). Workspace packages
expose a `katedrala-source` export condition that points at `src/index.ts`, so type checking and tests never
need a prior build.

## Standards

- **Strict TypeScript.** `strict`, `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`; no `any`.
  Non-null assertions are allowed only in numeric kernels (see `eslint.config.js`).
- **ESM only.** Relative imports use the `.js` extension (`NodeNext` resolution). Use `import type` for types.
- **Determinism.** Never iterate a `Map`/`Set` in insertion order where output order matters without sorting;
  never use `Date.now()`, `Math.random()` or locale-sensitive comparison (`localeCompare`) in analysis code;
  round published real numbers with `roundMetric`; sort with `compareStrings`.
- **No hidden global state.** Pass configuration and loggers explicitly. Libraries never write to stdout or
  stderr directly (`no-console` is enforced); they accept a `Logger`.
- **Structured errors.** Throw subclasses of `Error` with a stable `code`; never throw strings.
- **Package boundaries.** Respect the dependency rules in docs/ARCHITECTURE.md. A package may import another
  workspace package only if it declares it in `package.json` and references it in `tsconfig.build.json`.
- **Tests are required.** New behavior comes with unit tests; algorithms with property-based tests
  (fast-check) where a reference implementation or invariant exists; analyzer features with fixtures.
  Test-only helpers that are not `*.test.ts` files (such as `test-support.ts`) are excluded in the package's
  `tsconfig.build.json` so they never ship in `dist`.
- **Honesty.** Do not ship placeholder behavior. If something cannot be implemented correctly yet, define the
  interface, return a clear "not supported" error and document the limitation.
- **Truth labels.** TSDoc of analysis code says what kind of result it produces: [ESTABLISHED] for a cited,
  established algorithm or measure, [DERIVED] for a deterministic function of observed facts, and
  [KATEDRALA HEURISTIC] for Katedrala's own heuristics (all inference of modules, layers and roles). Every
  heuristic conclusion is worded as one: an `InferenceInfo.reason` begins with "Inferred:", and a description
  of a heuristic class, relocation or attachment names its rule and says "(Katedrala heuristic)". Descriptions
  of measurements stay factual. See docs/ALGORITHMS.md, "Conventions".
- **Analysis packages run anywhere.** `@katedrala/inference` uses no Node.js API and depends on `ir`,
  `graph` and `model` only; it never reads the clock, randomness or the locale (`Intl`, `localeCompare`,
  `toLocale*`), and folds case with `asciiLower` only. Lint enforces the import, global and API restrictions
  for its sources (tests and `*test-support.ts` files are exempt); reviewers check the rest (no `\p{…}`
  classes, no `toLowerCase`/`toUpperCase`, no unsorted `Map`/`Set` iteration on an output path).
- **Documentation.** Update the relevant document in `docs/` in the same change. Cite the source of any
  established algorithm or metric; label Katedrala-specific heuristics as such.

## Changing the IR

The IR (`packages/ir`) is a public contract. Any change must:

1. update the TypeScript types and their TSDoc,
2. regenerate the schemas (`pnpm schema`) and commit them,
3. follow the versioning policy in [docs/IR.md](docs/IR.md#versioning) (additive changes bump the minor
   version; anything else is a major change),
4. update docs/IR.md.

## Fixtures

Fixture repositories under `fixtures/` are analyzer inputs. Their bytes matter (hashes, line counts), so they
are excluded from formatting and normalized to LF by `.gitattributes`. Each fixture has a `README.md`
describing the architecture it models and the conclusions Katedrala is expected to reach, and an
`expected.json` with machine-readable ground truth (format in [fixtures/README.md](fixtures/README.md)).

`tests/fixtures/structure.test.ts` analyzes every fixture end to end and compares the result with its
`expected.json`. Expectation keys that belong to a pipeline stage not implemented yet appear as `todo` tests;
when you implement a stage, turn its keys into real checks.

`tests/fixtures/inference.test.ts` checks the inferred architecture of every fixture: the expectations of
milestone 5, and the **golden sections** in `tests/fixtures/golden/<fixture>.json` (components, modules,
layers and the roles of every file that has some). Any difference fails the test with a diff. When a change
is meant to change them, rewrite the goldens with

```bash
KATEDRALA_UPDATE_GOLDEN=1 pnpm test tests/fixtures
```

and explain every golden difference in the pull request: which modules, layers, confidences or evidence
texts changed, and why. A change of the algorithm that changes results at default settings also increments
the method version (`katedrala/module-inference@2`, docs/ALGORITHMS.md). `KATEDRALA_REPORT=1` prints the
perturbation measurements that docs/ALGORITHMS.md publishes.

## Commits

Write commit messages in the imperative mood with a short summary line. Reference the milestone or issue
where relevant.
