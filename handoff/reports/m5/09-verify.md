# Milestone 5 verification report

**Verdict:** milestone 5 meets the plan. `pnpm check` fails only on Prettier formatting of 3 website files under `site/`, which belong to the website team. Every check run separately passes, and the CodeVerse documents are byte-identical with workers and with concurrency 1.

I verified commit `d2e8606` ("WIP (cloud): milestone 5 integration, before the review"), which was committed while I worked. Nothing under `packages/`, `docs/`, `tests/`, `fixtures/` or the root config changed during the verification, and the tree there equals `d2e8606`. I edited no repository file and made no git writes.

All timings below are from this cloud machine (4 vCPU Xeon at 2.1 GHz, Node 22.22). They are not comparable with the plan's Windows figures.

## 1. `pnpm check`

**Result: exit 1, after 1 min 26 s.**
- `typecheck` passes.
- `lint` passes with 0 problems.
- `format:check` fails on 3 files, all in `site/` and unchanged since `57bfb4d`:
  - `site/components/lab/drawing/engine/stage.ts`
  - `site/public/data/codeverse-graph.json`
  - `site/scripts/build-codeverse-graph.mjs`
- Because the script chains with `&&`, `schema:check` and `test` never ran inside `pnpm check`.

**Run separately, everything passes:**

| Check | Result |
|---|---|
| `pnpm schema:check` | Passes |
| `npx prettier --check . '!site/**'` | Clean |
| `pnpm test` | 117 files; 2466 passed, 2 skipped, 55 todo; 47 s |
| `pnpm build` | Passes (`tsc -b`, already up to date) |
| Full suite with coverage | Passes |
| Full-size scale test (`KATEDRALA_SCALE=1`) | Passes |

- **Skipped tests:** the full-size scale test (opt-in), and the adapter-typescript CodeVerse sweep, which has a hard-coded Windows path.
- **Coverage:** 95.92 % of statements overall and 99.0 % for `@katedrala/inference` (3493 of 3528). All 42 milestone 5 files are at 90 % or more; the lowest are engine `structure.ts` (90.9 %), `modules/surface.ts` (94.6 %) and `layers/layers.ts` (95.7 %).
- **Scale test:**

| Files | `inferArchitecture` | Heap growth |
|---|---|---|
| 48 000 | 9.1 s | 263 MiB |
| 100 000 | 23.7 s | 1041 MiB |

These are consistent with ROADMAP's recorded 9.9 s / 260 MiB and 31.0 s / 1049 MiB.

## 2. CodeVerse run

**Setup:** `/codeverse` at `6b942bc`, read-only, `cache: false`, using `analyzeArchitecture` from the built `packages/engine/dist`. Its `git status` was still clean afterwards.

U5 saw `run.workers` 1 because vitest runs from TypeScript sources, where `./worker-entry.js` does not exist, so extraction falls back to the main thread. From the build, 3 worker threads started.

**Timings per stage, in ms:** median of 4 runs per mode, after one warm-up run of each, in alternating order.

| Stage | Workers (3 threads) | Concurrency 1 |
|---|---|---|
| listing | 56 | 55 |
| configuration | 2 | 1 |
| discovery | 3 | 4 |
| extraction | 2478 | 1572 |
| projects | 24 | 20 |
| linking | 492 | 460 |
| inference | 106 | 101 |
| total | 3266 | 2423 |

The inference stage ranged from 77 to 184 ms warm, and 148 to 221 ms on cold runs.

**Determinism: yes.** 12 documents (6 with workers=3, 6 with concurrency 1) are byte-identical: 17,229,679 bytes, sha256 `1294eb223440c763c4f450a9cfd98adaec121b875b9101e9f5d96b3b3983585f`. Further checks on CodeVerse, all passed:
- The document is valid against the strict schema and canonical as produced.
- `analysisDigest` equals `analyzeStructure`'s.
- The structural sections and diagnostics are byte-identical to `analyzeStructure`'s.
- Running inference on its own output gives the same sections (D-20).
- Two seeded shuffles of every input array give identical sections.
- Each file is in at most one component, module and layer, and every source file is in exactly one module.

**Counts:**
- 644 files (404 source, 188 test, 1 declaration), 14 233 edges, 1 package.
- 67 components.
- 27 modules, all inferred: 19 feature directories, 4 shared directories, 3 layer directories, 1 root module.
- 5 layers, and 0 inference diagnostics.
- 173 of the 188 tests are attached to modules; the one declaration file is left unassigned.
- 5 relocations, for example `src/parser/types.ts` to `mod:src/graph`. One composition root.

**Layers:**

| Rank | Layer | Files | Confidence | Source of membership |
|---|---|---|---|---|
| 0 | api | 7 | 0.773 | `src/app/api`, by location |
| 0 | job | 1 | 0.278 | `src/workers/layout.worker.ts`, by location |
| 1 | component | 130 | 0.743 | `src/components`, by location |
| 2 | client | 2 | 0.710 | by naming |
| 3 | model | 3 | 0.805 | `src/graph/model`, by location |

The observed layer dependencies are api → client, component → model and client → model. The other orderings come from `conventional-order` evidence, and there are no upward dependencies.

**Three example modules:**
1. **`mod:src/engine`** (feature directory; 81 members plus 35 attached tests). Confidence 0.970539039, from four weighted signals:
   - internal-edge-ratio: 0.4 × 0.975 (internal 197.0, crossing 10.0)
   - membership-margin: 0.25 × 0.936 (4 of 80 members contested)
   - prior-agreement: 0.2 × 1.0
   - module-size: 0.15 × 0.976

   Context evidence: attached files (23 by majority, 12 by location), a facade (`rendering/encodings.ts`) and a utility (`layout/types.ts`). Reason: "Inferred: directory `src/engine`; 98% of the dependency weight stays inside."
2. **`mod:src/lib`** (shared directory; 42 members plus 28 attached). Confidence 0.60995671, from:
   - prior-agreement: 0.3 × 1.0
   - module-size: 0.2 × 0.955
   - shared-usage: 0.5 × 0.238

   Context evidence: 10 utilities, 3 facades and 18 single-user files. Reason: "…10 of 42 files are used by two or more other modules."
3. **`mod:src/state`** (feature directory; 1 member plus 1 attached test). Confidence 0.25, from prior-agreement 0.2 × 1.0 and module-size 0.15 × 0.333. internal-edge-ratio and membership-margin are listed without a value and count 0 (D-45), because the only member, `explorer-store.ts`, is a utility. Reason: "…no member has dependency evidence in its package."

## 3. Plan conformance

**Each unit's "Done" criteria:**
- **U1: met.** `types.ts` matches plan 3.1 in structure: 52 declarations. The only addition is `Vocabulary.genericTokens`, U1's reported deviation; the other differences are doc comments. The replay check was posted.
- **U2: met.** The §4.6 replays for layered and clean architecture pass, and §2.4 is reproduced on synthetic and prototype copies.
- **U3: met.** All eight §3.6 rows and the §3.16 memberships for the five fixtures are reproduced.
- **U4: met.** `inferModules` reproduces §3.16's member lists and confidences, and the §3.13 worked example passes.
- **U5: met, except that `pnpm check` does not pass (finding 1).**
  - The todo count is 55 (down from 76).
  - There are 15 goldens. The ALGORITHMS.md "Results on the fixtures" tables match them exactly for all 15 fixtures.
  - The ALGORITHMS.md perturbation table regenerates with `KATEDRALA_REPORT=1` with no difference (45 rows).
  - The plan 7.3 assertions exist for all 15 fixtures, and the scale results are in ROADMAP.
  - `handoff/m5-site-followups.md` exists.

**Determinism rules and lint:**
- Calling the ESLint API on code without writing any file confirmed that every plan 2.1 ban fires in inference sources only. The same code gives no error in tests or in other packages.
- In `packages/inference/src`, banned APIs appear only in two TSDoc comments and in `scale.test.ts`.
- The type checker finds 42 Map/Set iteration sites; each is either sorted or order-independent.
- All milestone 5 property tests are seeded.

**D-numbers:** 72 of the 74 appear in non-test source. D-40 and D-44 were superseded, and D-62 appears in the tests and the fixture README, both as planned. The ALGORITHMS.md decision index covers all 72, and its links resolve.

**IR:** 12 schemas changed, in descriptions only. The IR type changes are comments only.

**Docs (plan section 8):** all present.
- ALGORITHMS.md has all 11 required sections.
- IR.md, ARCHITECTURE.md (ADR-007 wording, ADR-012, ADR-013), ROADMAP, CONTRIBUTING, both READMEs and the dependency-violations README are updated.
- I ran the README's `analyzeArchitecture` example on `fixtures/layered-architecture`, and it works.

**TSDoc:** all 186 exports have TSDoc with a truth label (gaps in finding 4).

## Findings, by severity

1. **Blocks U5's "pnpm check passes" (owner: website team).** The 3 unformatted `site/` files listed in section 1 stop the check chain. Possible fixes:
   - The promotion's switch step deletes the drawing lab, which removes `stage.ts`.
   - Format `build-codeverse-graph.mjs`.
   - Have that generator write formatted JSON, or add `site/public/data/` to `.prettierignore` as other generated files are.
2. **Medium-low: source comments cite documents that will be removed (owner: U5 or parent, before merge).** Comments cite the plan and the design, which live only in `handoff/`.
   - The non-test sources contain 93 "plan n.n" references, 251 "§n" references and 7 "review #n" references; code from earlier milestones has 2 "§" references and no plan references.
   - `tests/fixtures/inference.test.ts:5` cites `handoff/probe2/replay.out.txt`.
   - ALGORITHMS.md only resolves D-numbers.
   - Narrowest fix: a note beside the decision index that says what §n, "plan n.n" and "review #n" refer to and maps them to ALGORITHMS.md sections. Alternatively, commit the design to `docs/`.
3. **Low: a relocation description can contradict itself (plan 4.6 template, U4's `explain.ts`).** On CodeVerse, `mod:src/graph` reads: "Reassigned here by the strict-majority rule (Katedrala heuristic): `src/parser/types.ts` has 11 of its 23 dependents (weight 10.0 of 19.0)…".
   - The behaviour follows the plan: P5 decides on weight, and 10.0 > 9.5.
   - Suggested wording: state the weight majority first when the file count is not a majority.
   - No fixture has this case, but changing the template means updating the goldens and the exact strings in the tests.
4. **Low, documentation gaps (owner: U3 for the functions):**
   - These functions have no determinism note: `isDestinationKind` and `addUnit` in `modules/prior.ts`, `organizationStyle` in `modules/stems.ts`, and `fileNameWithoutExtension` in `modules/split.ts`, which also has no reference.
   - These 13 exported interfaces have no reference line:
     - in `types.ts`: `RolesResult`, `GroupOrganization`, `ClusterUnit`, `ModulesResult`, `LayersResult`, `InferenceInput`, `InferenceResult`;
     - elsewhere: `LayerExplanationInput`, `LayerOrder`, `LayerPartition`, `Attachments`, `InferredScope`, `ModuleSurfaces`.
5. **Information, outside milestone 5 (milestone 13): worker extraction is slower here.** On CodeVerse, extraction with the default worker pool is about 0.9 s slower than in-process (medians 2478 vs 1572 ms). Each analysis starts a fresh pool, and every worker loads the TypeScript compiler.
6. **Information, from milestone 2:** `packages/adapter-typescript/src/extract/robustness.test.ts:19` hard-codes `C:/Users/Awab/Desktop/PROJECTS/CodeVerse/src`, so the CodeVerse sweep is skipped in the cloud.
7. **Information, from milestone 1: broken links.**
   - `docs/ARCHITECTURE.md:402` links to `LANGUAGE_ADAPTERS.md` and `API.md`, which do not exist yet.
   - `CONTRIBUTING.md:83` links to `docs/IR.md#versioning`; the heading is now "Reading documents: versioning and tolerance".
8. **Housekeeping before merge (already known):** remove `handoff/**` from `eslint.config.js` and `handoff/` from `.prettierignore` together with the `handoff/` folder.

**Carried open issues, not new:**
- U4's two wording items: `organization-style` cannot say that a stem came from a sub-directory, and the lone-file clause names the prior unit.
- The engine does not expose `unitsModel` yet (needed in milestone 6).
- Q-11 / D-74 still needs sign-off.

CodeVerse also shows false positives of the naming heuristic. These are the documented limitation R-5 and are worded as heuristics:
- `camera-controller.ts` gets the role http-controller.
- `python-modules.ts` gets the role module-definition.
- A web worker file lands in the `job` layer.

## Files

I changed no repository files and added no tests. The probe scripts and their outputs are in `/tmp/claude-0/-home-user-Katedrala/c971897a-8e96-5c3d-ab48-42f9b0dacb7b/scratchpad/`:
- **Logs:** `check.out.txt`, `test.out.txt`, `schema.out.txt`, `coverage.out.txt`, `perturbation.out.txt`, `scale.out.txt`
- **CodeVerse probes:** `codeverse-run.mjs`, `codeverse-timing.mjs`, `codeverse-idempotence.mjs`
- **CodeVerse outputs (in `cv/`):** both documents, `codeverse-report.txt`, `codeverse-modules.json`, timing output
- **Conformance probes:** `tsdoc-audit.mjs`, `types-vs-plan.mjs`, `mapset-iteration.mjs`, `algorithms-vs-goldens.mjs`, `lint-probe.mjs`
