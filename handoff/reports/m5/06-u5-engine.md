# U5 engine

The final report of the "U5 engine" agent, saved from the local run before the cloud handoff (2026-10-09).
The continuation workflow passes this text on exactly as the original run would have.

U5's engine work for this phase is finished. Everything in my files passes type-check, lint, Prettier and tests. The whole-repository `pnpm typecheck`, `pnpm lint` and `pnpm test` still fail, but only in U3's unfinished files, which I did not touch. I made no git writes and did not touch `site/` or `.claude/`.

`analyzeArchitecture` does not produce architecture sections yet. It validates the configuration and runs the structure analysis, then rejects with `InferenceUnavailableError` (`code: "inference-unavailable"`) until `inferArchitecture` exists. This follows CONTRIBUTING's "Honesty" rule. The stage wiring itself lives in an internal `analyzeArchitectureWith(stage, options)` (not exported from the package) and is tested end to end with a deterministic stand-in stage.

**Whole-repository checks (last run):**
- `pnpm typecheck`: fails only at `packages/inference/src/modules/split.test.ts:131`.
- `pnpm lint`: 5 errors, all in that same file.
- `pnpm test`: 2124 passed, 76 todo, 1 failed (`modules/cluster.test.ts`, "runs the phases in order…").

All three failing files belong to U3. U2's `roles.test.ts` failed earlier in this run and passed by the end.

## Plan items
| Item | Status |
|---|---|
| Validators for `modules`, `layers` and `inference` (5.2) | Done |
| `resolveDeclarations` (5.4) | Done |
| `metricsProjectionOptions` (3.4) | Done |
| `analyzeArchitecture` stage wiring (2.3, 3.4), `ArchitectureSections`, `ArchitectureAnalysis` | Done, using the placeholder above |
| `ANALYSIS_STAGES` gains `"inference"`, with the TSDoc from review #31 | Done |
| Core exports `globSchema` and `globListSchema` (3.6) | Done |
| Engine index exports | Done |
| `infer.ts`, the rest of the inference `index.ts`, README, scale test, fixture tests, goldens, IR TSDoc and schemas, docs | Integration phase, not started |

Most of this was already in the tree from the stopped attempt. I reviewed it against the plan and kept it, with these additions: the new `architecture.test.ts`, two tests in `structure.test.ts`, more TSDoc in `architecture.ts`, and Prettier on all my files.

**Files** (all under `C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/`):
- `engine/src/`: `architecture.ts`, `architecture.test.ts`, `declarations.ts`, `declarations.test.ts`, `inference-configuration.ts`, `inference-configuration.test.ts`, `projection.ts`, `projection.test.ts`, `structure.ts`, `structure.test.ts`, `index.ts`
- `core/src/config/schema.ts`, `core/src/index.ts`

## Tests (78 in these files, all pass)
- **`architecture.test.ts`, 17 tests:**
  - inference sections are validated and get no "not evaluated" warning; invalid configuration is a `ConfigurationError` with the right message and line
  - a caller registering an inference section gets a `TypeError`; the caller's other sections are still registered
  - the stage receives the right input (model, settings, declarations, metrics projection, repository name)
  - the assembled sections pass the strict schema and come out canonical
  - roles are merged copy-on-write and the structural sections are otherwise unchanged; diagnostics end up sorted
  - same `analysisDigest` as `analyzeStructure` (D-61)
  - `ANALYSIS_STAGES` order and `timings.inference`; abort before the stage; a model over the final document (D-60)
  - default settings, and `include_tests_in_metrics` reaching both the projection and the module method (D-56, D-65)
  - dependency-violations' configuration still validates (5.5)
  - reordering overlapping modules in an explicit configuration file gives identical documents and digests (D-23)
  - the `inference-unavailable` rejection
- **`inference-configuration.test.ts`, 22 tests**, covering every engine item in the 6.5 test list, plus two seeded fast-check properties (300 runs each): valid configurations are accepted unchanged (D-61), and key order never changes the outcome (D-23).
- **`declarations.test.ts`** 7 tests (one seeded property); **`projection.test.ts`** 4 tests; **`structure.test.ts`** 2 new tests (working tree on disk, skipped symbolic links).

Statement coverage: `architecture.ts` 100%, `projection.ts` 100%, `declarations.ts` 100%, `inference-configuration.ts` 99.1%, `structure.ts` 90.9% (raised from 88.3% by the two new tests), core `schema.ts` 98.7%.

## Deviations from the plan
1. **Plan defect: `__proto__` keys.** zod 4 records silently drop a `__proto__` key; I confirmed this with zod 4.6.5 on both YAML and JSON input. The validated configuration would then differ from the unvalidated one, which breaks D-61. Every record section now rejects `__proto__` keys with a clear message.
2. **How mapping keys are checked.** Keys are validated per key and reported at the key's own path, instead of through zod key schemas, which only say "Invalid key in record". The set of accepted configurations is the same, and partial role-keyed maps stay valid.
3. **Extra core export.** `unknownKeyMessage` is now exported from core's index, so unknown roles get a "did you mean" suggestion.
4. **Reading of D-69 for lists.** A name both added and removed in one list (`helpers` and `!helper`) is rejected, and so is a name listed twice. I read the name of `!name` as `name`.
5. **Messages.** The 1/1024 and exclusion-only checks do not repeat a range or "at least one" message already reported. `min_module_files > max_module_files` is reported at whichever key was configured.
6. **Wider parameter.** `metricsProjectionOptions` accepts just the two settings fields it reads; callers passing full `EffectiveCoreSettings` are unaffected.
7. **Plan inconsistency:** section 3.3 leaves `withRoles` out of `@katedrala/inference`'s public API, but 2.3 and 3.2 have the engine call it. At integration I will export it from `index.ts`; that is the narrowest fix.

## What other units need to know
- **U4 (`Declarations`):**
  - Modules come sorted by name, with every file a glob matches whatever its role. Role filtering (D-22), overlaps, empty-match warnings and `~inferred` are yours.
  - `entry` is present only when configured. `configurationFile` is present only when the configuration file is a file of the snapshot.
  - Declared module names are non-empty, with no surrounding spaces, `#`, `~` or `__proto__`.
- **U2 (layers):**
  - Declared layers keep list order, and `rank` is the configured value or the position. Names are unique but otherwise free text (`Domain Model` is allowed). Files are every match; keeping `source` files only (D-50) is yours.
- **U2 (roles):**
  - Configured roles come sorted by role, with every match; restricting them to `source` files (D-17) is yours.
  - The engine calls `withRoles(document.files, result.roles)` and relies on it being copy-on-write and keeping entries sorted by role, then source.
- **All:** validated configurations guarantee that `type_only_weight` is on the 1/1024 lattice, `min_module_files ≤ max_module_files`, each tier layer appears once, and member glob lists include at least one non-exclusion pattern.

## Open issues
- **At integration:** wire `{ inferArchitecture, withRoles }` into `INFERENCE_STAGE` in `architecture.ts`, export both from `packages/inference/src/index.ts`, and replace the `inference-unavailable` test. The D-23 reorder test and the strict-schema test then need re-running with real inference; today they run on the stand-in.
