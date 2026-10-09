# U3 clustering

The final report of the "U3 clustering" agent, saved from the local run before the cloud handoff (2026-10-09).
The continuation workflow passes this text on exactly as the original run would have.

**U3 report: module clustering, P1–P6 (plan 6.3)**

Every plan item of 6.3 is done, including the replays its "Done" row requires. The whole repository passes: `pnpm typecheck` and `pnpm lint` are clean, `pnpm test` gives 113 files and 2220 passed (76 todo), and `pnpm schema:check` passes. Prettier and ESLint are clean on all my files.

The earlier attempt had already written all the files. I checked them against the plan, kept them, and added tests and test-support improvements. One intermediate full run failed in U4's `explain.test.ts`, which U4 was editing at the time; the final run is green. No git writes, and nothing touched in `site/`, `.claude/`, `types.ts` or any shared root file.

## Plan items
| Item | Status |
|---|---|
| P1 `prior.ts` | Done (D-11, D-25) |
| P2 `stems.ts` | Done (D-26, D-27, D-28, D-67, D-70). Sub-directory stems containing `%`, `#` or `~` give no stem, which closes U1's open D-28 item. |
| P3 `classes.ts` | Done (D-04, D-29, D-30, D-31, D-66): worklist fixpoint, with the trigger data in `StructuralClasses` |
| P4 `split.ts` | Done (D-32, D-33, D-34, D-68). Key dedupe starts from P2's stems, then the file-name fallback, then the hash. |
| P5 `reassign.ts` | Done (D-35, D-36, D-37, D-74) |
| P6 `identity.ts` | Done (D-38, D-39) |
| `cluster.ts` (`clusterScope`) | Done |
| `reference.test-support.ts` | Done: naive P3 and P5 implementations, test scopes, random scopes |
| §3.6 table, all eight rows, on prototype graphs | Done |
| §3.16 memberships for layered-architecture, ambiguous-boundaries, clean-architecture, tangled-architecture and dependency-violations | Done; ambiguous-boundaries includes §3.9's three moves with their in and out weights |
| Properties of 7.1 | Done: stem components connected and spanning two layer children; P4 pieces connected; identity; P3 equal to the naive passes; P5 equal to the naive implementation |
| Statement coverage | 99.4% overall: `identity.ts` 96.8%, `stems.ts` 99.4%; `prior.ts`, `classes.ts`, `split.ts`, `reassign.ts` and `cluster.ts` at 100% |

## Files
All in `C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/inference/src/modules/`:
- **Source:** `prior.ts`, `stems.ts`, `classes.ts`, `split.ts`, `reassign.ts`, `identity.ts`, `cluster.ts`, `reference.test-support.ts`
- **Tests:** `prior.test.ts`, `stems.test.ts`, `classes.test.ts`, `split.test.ts`, `reassign.test.ts`, `identity.test.ts`, `cluster.test.ts`

Changed in this run:
- `classes.ts`: a TSDoc note for deviation 1 (comment only).
- `reference.test-support.ts`: random scopes are now larger (they averaged 6 files before), and they include chains of files that move one per pass.
- The test files, with the additions below.

## Tests: 106, all passing
| File | Tests |
|---|---|
| `prior.test.ts` | 16 |
| `stems.test.ts` | 14 |
| `classes.test.ts` | 21 |
| `split.test.ts` | 15 |
| `reassign.test.ts` | 14 |
| `identity.test.ts` | 15 |
| `cluster.test.ts` | 11 |

New in this run:
- "does not apply stems at a coverage of 0.249, and applies them at 0.25 (default threshold)" (249 and 250 of 1000 files).
- "records a rule that does not depend on the evaluation order (D-30)".
- "lets a chain of files follow one another, one file per pass, up to maxPasses (D-37)": 5 passes, and `converged` is false at `maxPasses` 3.
- The replays now pin each structural class with what triggered it, and the prior members of the moved files.
- The identity property also checks that every unit has a non-empty prior.
- The P2, P3, P4 and P5 property tests now assert that the random scopes actually produced each class, piece, cascade and pass-limit stop, so the tests compare more than empty cases.

## Cross-checks (scratch only)
- **Linker graphs, all 15 fixtures:** `clusterScope` output matches `probe2/replay.out.txt` exactly. That covers the P2 rows, the composition roots (all 26 with the same rule), utilities, facades, the moves with their weights, and the memberships.
- **Prototype graphs, the five design fixtures:** the output equals U4's hand-built `DESIGN_CLUSTERINGS` in `design-clusterings.test-support.ts`: units with their priors, classes with their triggers, groups, moves and source roots.
- **Scale:** on a scope shaped like the 7.5 scale test, `clusterScope` takes about 140 ms for 12 000 nodes and about 370 ms for 48 000. Every generated recurring stem became its own stem module.

## Deviations
1. **Plan defect: `orchestratorRule`.** The plan records "which rule fired first", but that depends on the order in which files are checked. The worklist of D-30 checks them in a different order from the prototype's repeated passes, so a file can meet the shape rule first in one and the entry-point rule first in the other (the new test builds such a case). I record the rule that holds once the set is final, preferring the entry-point rule, as the prototype does. That rule's conditions always hold for the final classes, and on all 15 fixtures it equals the replay's rule.
2. **Root module of an unnamed package.** When the source root is a container below the package directory, the name is the package directory's name, as for unnamed package components (D-12). The plan's literal text would give `src`.
3. **Stem modules from sub-directories** (D-28) are named by the sub-directory's spelling. The plan's "most frequent first token of the file names" only fits file-name stems.
4. **Feature child without its own module.** When a stem should join a feature child that P1 split by size and that has no loose files, P2 creates a feature module for that directory.
5. **`converged`.** It is false only when one more pass, run without applying its moves, would move a file. `passes` never exceeds `maxPasses`.

## What other units need to know
- **U4:**
  - `group` is set on stem modules only.
  - Relocation maps are in key order. `dependents` lists modules with at least one dependent file; `dependencies` lists modules with weight above 0.
  - `dependencyUnits` and `dependentUnits` are filled for every file, not only for composition roots and utilities.
  - A module split by P4 keeps its own key and kind; its prior holds only the files that joined no piece.
  - Files of a shared module stay pinned even after P4 splits it, because the pinned set is decided before P4.
- **U5:**
  - Use deviations 1 to 5 in docs/ALGORITHMS.md. The TSDoc of each phase function already states its rule, rationale and decisions.
  - My replays use stand-in layer labels taken from directory names, not U2's roles. Stem module names on the real pipeline (high-fan-in's `order` instead of `orders`, for example) may therefore differ, and the goldens settle them.

## Open issues
None for U3.

Scratch probes and their outputs are in `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/u3/` and `.../scratchpad/u3r/`.
