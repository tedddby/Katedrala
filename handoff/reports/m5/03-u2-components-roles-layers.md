# U2 components-roles-layers

The final report of the "U2 components-roles-layers" agent, saved from the local run before the cloud handoff (2026-10-09).
The continuation workflow passes this text on exactly as the original run would have.

U2 is complete: every item of plan 6.2 is implemented and tested, and the design replays reproduce §4.6 and §2.4 exactly on the prototype graphs. My 97 tests pass, statement coverage of my files is 99.7%, and my files are lint- and Prettier-clean. `pnpm typecheck` now passes for the whole repository. `pnpm lint` and `pnpm test` do not yet pass, but only because of other units' in-progress files (open issue 1). No git writes, and nothing under `site/` or `.claude/` was touched.

The earlier attempt had written all six source files and the components tests, but none of the other tests. I checked those sources against the plan and kept them, with these fixes:
- `layers/explain.ts` had an invisible literal U+FFFF character inside a regex; it is now the escape `\uFFFF`.
- The declared-layer warnings now use the same wording as U4's declared-module warnings, as the plan asks ("the same way").
- Added the missing D-55 and D-57 comments and a D-15 comment for class names, truth labels on exported interfaces, a readable fallback reason for hand-made inputs, and fixed one lint error in `components.test.ts`.

## Plan items
| Item | Status | Evidence |
|---|---|---|
| Components (4.2, D-12, D-13) | Done | §2.4 trees reproduced for monorepo and clean-architecture, on synthetic copies, on prototype models and on the linker documents (`presentation/http` included) |
| Roles and labels (4.3, D-11, D-14 to D-20) | Done | Role entries identical to `probe2/replay.out.txt` on all 15 linker graphs (116 files) |
| Layer membership and declared layers (4.5, D-50, D-71, D-24) | Done | |
| Layer graph, exact ordering, greedy fallback, conventional arcs, ranks (D-51 to D-53, D-55) | Done | Express gets exactly the six conventional arcs listed in 7.3 |
| Confidence, evidence, reasons (4.6, D-45, D-54, D-58, D-66) | Done | |
| `inferLayers` | Done | On all 15 linker graphs, layer graph, members, ranks, confidences and every signal value equal the replay |
| Design replays (6.2 "Done") | Done | Layered: 0.939, 0.925 (0.924666667), 0.939, 0.862, ranks 0–3, exactly the 4 layer dependencies. Clean: infrastructure 0.737 and presentation 0.795 at rank 0, application 0.795 at rank 1, domain 0.878 at rank 2, the 4 dependencies, none upward |

## Files
All in `C:/Users/Awab/Desktop/PROJECTS/Katedrala/packages/inference/src/`:
- `components.ts`, `components.test.ts`
- `roles.ts`, `roles.test.ts`
- `layers/partition.ts`, `layers/order.ts`, `layers/explain.ts`, `layers/layers.ts`, and a `.test.ts` for each

## Tests (97, all passing)
| File | Tests | Covers |
|---|---|---|
| `components.test.ts` | 16 | §2.4 monorepo (synthetic and prototype); clean tree with `presentation/http`; collapsed chains; branch points without files; package root without code; nested packages; several manifests (D-13); unnamed manifests (D-12); root without manifest; no owned files gives `[]`; ownership by role; totals; shuffled-order determinism; seeded partition property |
| `roles.test.ts` | 29 | Each vote source; last matching qualifier (D-15); word and class suffixes (D-15, D-16); no class votes without symbols; outermost location (D-18); source roots per package (D-11); `domains/` gives no vote; location roles only where one role maps to the layer; tests get nothing (D-17); own entries never vote (D-20); the D-14 SQL repository case; noisy-OR 0.94; ⊥ and precedence ties (D-19); ties after `roundMetric` (D-67); `min_label_score`; vote order; idempotence; shuffle property; role evidence wording (D-66); entity bound; `withRoles` |
| `layers/partition.test.ts` | 9 | Pruning; fewer than 2 layers; only votes for the file's own label place it; declared layers: overlaps, empty-match warnings (D-71), ranks, bounded example paths, duplicate names |
| `layers/order.test.ts` | 17 | Layer weights and type-only shares for weights 0.5, 1, 0 and 3/1024; edge kinds; exact order breaks weight ties by inversions between tiered layers only, then lexicographic order; exact order equals brute force for k ≤ 7 (seeded, lattice weights, tiers partly absent); greedy beyond the bound; express conventional arcs and ranks; shared-package rule (D-53, D-55); properties: no conventional arc creates a cycle, every kept arc goes to a higher rank, minimum removed weight per cycle |
| `layers/explain.test.ts` | 14 | Weights sum to 1; direction consistency and order support by hand; absent direction contributes 0 (D-54); snapshots of every reason and description variant (D-66), including `upward-dependencies` with its type-only share; method string |
| `layers/layers.test.ts` | 12 | Both design replays; monorepo layers at rank 0 with confidence 0.295; no layers where fewer than two survive; invariants on all 15 prototype fixtures; repository without manifests (D-53); type-only counted when `include_type_only` is false (D-51); edge kinds; greedy ordering; disabled inference; declared layers; canonical order and shuffle property |

Statement coverage: `components.ts`, `roles.ts`, `explain.ts`, `order.ts` 100%; `partition.ts` 98.6%; `layers.ts` 95.7%.

## Deviations from the plan
1. **Reason wording (small plan defect).** The template says "nothing depends on this layer". Files outside any layer, such as `main.ts`, often do, so the sentence would be false. I wrote "no other layer depends on it", and "no dependency connects it with another layer" when the layer has neither dependents nor dependencies.
2. **Class-name votes skip classes whose `SymbolEntity.role` is not `source`** (D-17 applied to symbols). No current file is affected; the TypeScript adapter never sets it.
3. **Several manifests in the enclosing directory.** A component without its own manifest lists every package of the nearest manifest directory, not one. This follows D-13 and the IR text "packages declared in this directory or owning it".
4. **Small choices the plan leaves open:**
   - Role entry evidence is ordered strongest first.
   - `inferRoles` bounds evidence entities by `model.document.limits`, because `RolesInput` has no limits field.
   - `upward-dependencies` mentions the type-only share only when it is above 0.
   - `exactLayerOrder` throws above 24 layers (the validator allows at most 16).
   - `declaredLayers` throws on duplicate layer names.

## What other units need to know
- **U5, `index.ts`:** the plan's public-API list (3.3) leaves out `withRoles`, but your engine's `InferenceStage` needs it from the package. The signatures match.
- **U5, inputs and outputs:**
  - Declared layers ignore `layers.enabled`.
  - Inferred layers produce no diagnostics.
  - Layer drafts come sorted by rank, then id.
- **U5, fixture assertions:** 7.3's rows for layers, roles and components are confirmed by the production code on linker graphs, including nestjs' roles and express' conventional arcs.
- **U5, ALGORITHMS.md drafts:**
  - Components [DERIVED]: the four component rules; collapsed chains named relative to their parent; D-12 and D-13 naming.
  - Roles [KATEDRALA HEURISTIC]:
    - Source files only. Confidences: configuration 1.0, detector its own, qualifier 0.8, word or class-name suffix 0.6 (at least two words), location 0.7.
    - Location comes from the outermost layer directory strictly below the source root, so containers never vote. A package whose source root is itself a layer directory gets no location votes.
    - Votes combine by maximum within a source and noisy-OR across sources (D-14). Ties go to precedence, then ⊥, then name (D-19).
  - Layers [KATEDRALA HEURISTIC]: pruning; layer graph with type-only references always counted (D-51); exact ordering (Bodlaender et al. 2012) up to `exact_order_max_layers`, greedy (Eades et al. 1993) beyond; conventional arcs (D-53); longest-path ranks; weights 0.35/0.35/0.20/0.10 with absent signals counting 0.
- **U3, U4:**
  - Labels exist for every source file with a vote. `label` is null for ⊥ or a score below the threshold.
  - `score` is already rounded.
  - `location` is set whenever a location vote exists, also when another label wins.

## Open issues
1. Repository state at my last run:
   - `pnpm typecheck` passes.
   - `pnpm lint` fails only in U4's `modules/attach.test.ts` and `modules/scopes.test.ts`.
   - `pnpm test` fails only in U4's `modules/surface.test.ts`.
   - In one earlier full run, adapter-typescript's CodeVerse sweep timed out under machine load; it passes alone in 8.6 s.
2. None in U2.

Scratch probes and their outputs are in `C:/Users/Awab/AppData/Local/Temp/claude/c--Users-Awab-Desktop-PROJECTS-Katedrala/f7609e3b-1ca5-4e98-a818-ae87ef209574/scratchpad/u2/`:
- `layers.probe.ts`, with output in `linker.out.txt` and `proto.out.txt`
- `components.probe.ts`, with output in `components.out.txt`
- `templates.probe.ts`, with output in `templates.out.txt`
