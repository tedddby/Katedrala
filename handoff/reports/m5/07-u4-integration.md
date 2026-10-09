# U4 integration

The final report of the "U4 integration" agent, saved from the local run before the cloud handoff (2026-10-09).
The continuation workflow passes this text on exactly as the original run would have.

U4's integration is finished. `modules/modules.ts` now provides `inferModules`. On the design prototype's graphs it reproduces §3.16's member lists and confidences for all five named fixtures, which is plan 6.4's "Done" condition. `pnpm typecheck`, `pnpm lint` and `pnpm test` all pass for the whole repository (114 files, 2246 passed, 76 todo), and Prettier is clean on my files. I made no git writes, did not touch `site/` or `.claude/`, and edited no shared root file.

## Plan items (6.4)
| Item | Status |
|---|---|
| `modules/modules.ts`: `inferModules` | Done |
| Integration tests (6.4) | Done: 26 tests in `modules.test.ts` |
| "Done": `inferModules` on prototype graphs gives §3.16's members and confidences for the five fixtures | Done |
| Declared modules, P0, P7–P9 and explain at unit level | Done in the earlier phase; unchanged |

`inferModules` runs the phases in the order the plan fixes: declared modules, the D-21 check, P0 scopes, `clusterScope` per scope (with entry points, the roles stage's labels and the repository name), module ids with `~inferred` on a name collision, P7 attachments, P8 surfaces, then P9 signals, explanations and the `limit-reached` diagnostic per scope.

It returns:
- the declared and inferred drafts in id order, with keys in the order of the IR's `ModuleEntity`;
- each inferred module's `files` as its own members plus the tests and declarations attached to it, sorted;
- the anchor copied from the clustering's unit;
- diagnostics: the declared-module warnings first (in name order), then `limit-reached` per scope (in scope order).

## Files
- `C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/inference/src/modules/modules.ts` (new)
- `C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/inference/src/modules/modules.test.ts` (new)

## Tests (26, all pass)
**§3.16 and §3.13 replays on prototype graphs:**
- "reproduces §3.16 for <fixture>: ids, kinds, names, member lists and confidences", once each for layered-architecture, ambiguous-boundaries, clean-architecture, tangled-architecture and dependency-violations. Every confidence matches §3.16 to three decimals.
- "replays §3.13's worked example": the complete `InferenceInfo` of `mod:src#payment`, confidence 0.807142857.
- "counts every wiring member of layered-architecture's root once: 0.867, not 1.167".
- "explains ambiguous-boundaries' three relocations with §3.9's weights and the grab bag".
- "gives clean-architecture's domain its barrel as entry point and an import-based publicApi (D-63)".
- "keeps tangled-architecture's feature directories, with §3.16's low cohesion and margins".
- "keeps dependency-violations' declared modules exact and out of every inferred module (§3.14)".

**Assembly on synthetic models:**
- "returns declared and inferred drafts in identifier order, canonical as produced"
- "appends ~inferred to an inferred module whose key is a declared module's name (§3.10)"
- "produces declared modules only when module inference is off (D-21)"
- "returns no module for a repository without files to group"
- "passes the declared modules' warnings through, located at the configuration file (D-23, D-24, D-71)"
- "reports limit-reached for a scope whose reassignment stopped at max_passes (D-37)"
- "lists attached tests and declarations as members for navigation only (D-63, D-64, D-65)"
- "attaches tests counted in metrics by strict majority only (D-65)"
- "follows the attachment flags"
- "computes publicApi under the metrics projection's type-only setting (D-63)"
- "bounds evidence entities and relocations by limits.maxEvidenceEntities (D-72)"
- "keeps inferred modules inside one package and lets declared modules span packages (§3.4, D-65)"
- "attaches nestjs-app's spec by location and says so (D-64)"

**Seeded fast-check properties:**
- "keeps the partition, identity and InferenceInfo invariants on random models (property)": 150 runs, checked against a brute-force reading of the input. The generated cases include every module kind, relocations and attachments.
- "does not depend on the order of the document's arrays or of the declarations (property)": shuffled documents and reversed declarations, on all 15 prototype fixtures and on random models.

Statement coverage is 97.7% for `modules.ts`; the only uncovered statement is the throw for the internal-defect case below. Across all U4 files it is 98.6%, with `surface.ts` lowest at 94.6%.

## Choices beyond the plan
- **Internal errors are raised.** If the phases' per-scope arrays ever disagree in length, `inferModules` throws an `Error` instead of silently dropping a module. This can only come from a bug, never from input.
- **Early return.** When there are neither declared nor inferred modules, the stage returns empty before building the attachment and public-API projections.
- **Tangled ranges.** §3.16's "internal-edge-ratio 0.39–0.73" is 0.385–0.727 at three decimals; 0.3846 rounds to 0.38 at two decimals, so the design rounded twice. The test pins the three-decimal values.

## What other units need to know
**U5, plan inconsistency:** 7.1's InferenceInfo property says "every `value` … in [0, 1]". Context signals carry counts (`composition-roots`, `utility-files`, `attached-files`, `oversized-directory`, `relocated-files-omitted` and others), so the property must apply to weighted evidence only.

**U5, wiring:**
- Call `inferModules` with:
  - `declared: declarations.modules`;
  - `labels` from `inferRoles({ …, configured: declarations.roles })`;
  - the metrics projection;
  - `limits: document.limits`;
  - `declarations.configurationFile`.
- Inferred `files` include attached tests and declarations. Build `components` and aggregated dependencies from all of them, as D-65 requires.
- Drafts lack `components`, `dependencies` and `dependents`. `canonicalizeDocument` does not reorder keys, so build each entity explicitly if you want the serialized key order to follow the IR.
- `when_declared` and `enabled` appear in the module method string when they differ from their defaults, for example `?when_declared=none`.

**Linker-graph check (scratch only):** I ran production `inferModules` on all 15 fixtures through the engine's own pipeline: `analyzeStructure`, `resolveDeclarations` and `metricsProjectionOptions`. The results match 7.3's module assertions:
- relocations and singleton absorptions in express, fastify and high-fan-in;
- the monorepo `catalog` cascade into `orders`;
- typescript-features' `globals.d.ts` and express's `types/express.d.ts` left unassigned;
- the nestjs spec attached by location, and the fastify test attached by majority;
- composition roots, utilities and barrels as listed.

The confidences equal the replay table (clean 0.512/0.727/0.650, tangled 0.532/0.607/0.570/0.514/0.638, ambiguous 0.812/0.777, layered `user` 0.747, dependency-violations 0.746/0.685). The text for `stock-availability.ts` reads "2.0 of 2.0", as U1 corrected. The probes and outputs are in the scratchpad at `u4i/`: `linker.probe.ts` with `linker.out.txt`, and `modules.probe.ts` with `modules.out.txt`.

## Open issues
Both are carried from the unit-level phase; neither is new:
- `organization-style` cannot say at group level that a stem came from a recurring sub-directory (D-28). Fixing it needs a new `GroupOrganization` field in `types.ts` (U1/U3).
- The lone-file clause names `Relocation.from`, the prior unit. For a file that moved twice, that can differ from the unit it last left.
