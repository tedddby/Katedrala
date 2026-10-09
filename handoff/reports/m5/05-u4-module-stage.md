# U4 module stage

The final report of the "U4 module stage" agent, saved from the local run before the cloud handoff (2026-10-09).
The continuation workflow passes this text on exactly as the original run would have.

U4's unit-level work is done: declared modules, P0, P7, P8, P9 and explain, all tested with hand-built `ScopeClustering` values. `modules.ts` is not written, as instructed. On the final run `pnpm typecheck`, `pnpm lint` and `pnpm test` all pass (113 files, 2220 passed, 76 todo). Prettier is clean on all my files. I made no git writes and did not touch `site/`, `.claude/` or any shared root file.

One earlier full-suite run failed once. The CodeVerse sweep test in adapter-typescript (not a U4 file, unchanged) timed out at 30 s while other sessions were also running. It passes alone in 6 s, and the next full run passed.

Most of the code was already in the tree from the stopped attempt. I checked it against the plan and kept it. This run added `explain.test.ts`, fixed three wording problems in `explain.ts`, fixed three lint errors in tests, and added missing truth labels and D-number comments.

## Plan items
| Item | Status | Notes |
|---|---|---|
| `modules/declared.ts` | Done | `resolveDeclaredModules` (D-22, D-23, D-24, D-71), `inferredModuleId` (`~inferred`), `identifyInferredModules` |
| `modules/scopes.ts` (P0) | Done | `shouldInferModules` (D-21), `moduleScopes` (D-02, D-03), `metricsEdgeKinds`, `entryPointFiles` (D-31) |
| `modules/attach.ts` (P7) | Done | `attachFiles` (D-41, D-42, D-65); each attachment records its rule for D-64 |
| `modules/surface.ts` (P8) | Done | `moduleSurface`: entry points (D-43), `publicApi` from imports and re-exports only (D-63), packages |
| `modules/confidence.ts` (P9) | Done | `MODULE_SIGNAL_WEIGHTS`, `moduleSignals`, `signalValue` (D-45, D-46, D-47, D-67) |
| `modules/explain.ts` | Done | `explainScope`, `MODULE_KIND_SIGNALS` (D-48), `reassignmentLimitDiagnostic` (D-37); D-49, D-56, D-58, D-64, D-66, D-72, D-74 |
| `modules/modules.ts` | Not done | Next phase, as instructed |

## Files changed this run
All in `C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/inference/src/modules/`:
- `explain.ts` — three wording fixes:
  - **Shape-rule clause.** "Nothing outside its unit depends on it" is now judged against the unit P3 classified. The pieces and the remainder of an oversized directory count as one unit. Before, a dependent that P4 moved into a piece was wrongly called "outside".
  - **P4 remainder.** Its prior-agreement text now says "the files of the oversized directory `x` that joined no piece".
  - **Sub-directory stems (D-28).** When not every prior member's file name gives the stem, the kind signal and prior-agreement say "the name stem `x` (of file or sub-directory names)".
  - It also gains TSDoc labels and the D-32, D-36 and D-57 comments.
- `explain.test.ts` — new.
- `declared.ts`, `scopes.ts`, `attach.ts`, `surface.ts`, `confidence.ts` — TSDoc truth labels and references only.
- `scopes.test.ts`, `attach.test.ts`, `surface.test.ts` — removed unnecessary type casts that failed lint.
- Kept from the earlier attempt: the five sources above, their tests, `hand-built.test-support.ts` and `design-clusterings.test-support.ts`.

## Tests (92, all pass)
| File | Tests | Covers |
|---|---|---|
| `declared.test.ts` | 9 | Role filter (D-22); overlaps by name in any spec order, one warning per pair with count and bounded paths (D-23, D-24); empty match (D-71); unknown files; bad names; `~inferred`; partition property (seeded) |
| `scopes.test.ts` | 9 | `when_declared`/`enabled` (D-21); scope order; declared files are not nodes; no cross-scope arcs (D-03); settings; induced-subgraph property (seeded) |
| `attach.test.ts` | 8 | Majority; majority to a declared module or another scope → unassigned; declaration without majority → unassigned; test location by direct nodes and ancestors; `include_tests_in_metrics`; flags off; nodes skipped; weight 0; tie by smallest id; reference property (seeded) |
| `surface.test.ts` | 6 | Index and barrel in the anchor; declared `entry`; D-43; `publicApi` follows the metrics type-only setting and roles; attached and unassigned files excluded; packages; clean-architecture domain lists `index.ts` and not `ports/member-repository.ts` (9 files); brute-force property (seeded) |
| `confidence.test.ts` | 14 | Weights per kind sum to 1; §3.13 worked example 0.807; every §3.16 confidence of the five design fixtures; `wiring-share` once (0.867, not 1.167); D-45, D-46, D-47; naive-recomputation property (seeded) |
| `explain.test.ts` | 46 | Full InferenceInfo of `mod:src#payment` (0.807142857); §3.16 confidences through `explainScope` with the 4.6 invariants; exact text of every description and reason variant (D-66 wording); D-72 cap with the omitted count; entity truncation; method string (D-56); D-37; error cases; invariant property on random clusterings (seeded) |

Statement coverage: 98.67% overall. Per file: `confidence.ts`, `declared.ts` and `scopes.ts` 100%, `explain.ts` 99.5%, `attach.ts` 96.3%, `surface.ts` 94.6%. Mutation checks confirmed the wording tests catch template changes and the shape-rule fix.

## Deviations from the plan
1. **D-43, read narrowly.** For a declared module without `entry`, I use the common directory of its members whose role is a node role (`source` by default), not of all members. Otherwise tests in `test/` would move that directory to the root, and `index.test.ts` would become an entry point. The inferred rule also looks at node members only. Declared barrels use P3's facade test on the node-role graph, built only when needed.
2. **Template wording differs from plan 4.6 in a few places**, because the plan's examples are inaccurate in some cases. The exact texts are pinned in `explain.test.ts`.
   - **Stem reason.** It reads "files with the name stem `payment` in 4 layer directories of `src` form a connected group". The plan's "files named `payment.*`" is wrong for `orders.controller.ts`, `payment-gateway.ts`, `PaymentService.ts` and sub-directory stems. A D-27 union says "form 2 connected groups".
   - **P4 remainder reason.** It reads "the 12 files that joined no piece stay here". The plan's "have no edge to a piece" is false for the orchestrators and utilities in the remainder.
   - **"Other".** Texts say "other modules" and "3 other units", which is what the counts measure.
   - **`organization-style`.** It also names the feature and shared children and the style.
   - **No evidence.** When there is no evidence, texts say "in its package" or "among the files outside packages".
3. **Additions.**
   - `UnitSignals` adds `priorComponents`, used for the D-27 wording.
   - The lone-file clause (D-74) is printed when the move's support is below `move_min_support`, which only condition 4's exception allows.
   - `attached-files` has the number of attached files as its value.
   - `resolveDeclaredModules` throws `RangeError` on duplicate names, which the engine never produces.

## What other units must know
- **U3:**
  - `explain.ts` reads `orchestratorRule` (1 = entry-point rule, 2 = shape rule), `dependencyUnits`, `dependentUnits`, every `GroupOrganization` field, and the `Relocation` maps keyed by unit key.
  - Both the P4 pieces and the remainder must carry `oversized` with the same directory: the P3-unit grouping and the "grouped into N pieces" count depend on it.
  - `Scope.packageName` is the package's name as the document writes it. For an unnamed manifest that is its path, or `.` at the root (D-12/D-38).
- **U5:**
  - Module signal ids:
    - weighted: `internal-edge-ratio`, `membership-margin`, `prior-agreement`, `module-size`, `shared-usage`, `wiring-share`;
    - kind (D-48): `feature-directory`, `layer-directory`, `shared-directory`, `root-files`, `file-stem`, `split-piece`;
    - other context: `organization-style`, `relocated-files`, `relocated-files-omitted`, `single-user-files`, `composition-roots`, `utility-files`, `facade-files`, `attached-files`, `oversized-directory`, `anchor-drift`.
  - Overlap warnings use `configuration-warning`, with `file` set to the configuration file and no line.
  - The non-convergence diagnostic is `limit-reached` at info level.
- **Next phase (`modules.ts`):** the call order is `resolveDeclaredModules` → `shouldInferModules` → `moduleScopes` → `clusterScope` (with `entryPointFiles`) → `identifyInferredModules` → `attachFiles` → `moduleSurface` → `moduleSignals` / `explainScope` / `reassignmentLimitDiagnostic` per scope. My scratch replay (P0, U3's current `clusterScope`, then P7–P9 on prototype graphs) already reproduces §3.16's confidences for all five design fixtures. It is in the scratchpad at `u4/replay.probe.ts`, output in `u4/replay.out.txt`.

## Open issues
- `modules.ts` waits for the next phase.
- `organization-style` always says "file-name stems" at group level, because `GroupOrganization` does not record that a stem came from a recurring sub-directory (D-28). Fixing it needs a new `types.ts` field (U1/U3). The per-module texts are already precise.
- The lone-file clause names `Relocation.from`, the prior unit. For a file that moved twice, the unit it left at its last move can differ, and the record does not keep it.
