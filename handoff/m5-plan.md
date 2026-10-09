# Milestone 5 implementation plan: architectural inference

Status: implementation plan for review, revision 2 (2026-10-07). Repository state: `c156e96` (milestones 1–4
committed; `29e5878` only untracks local settings). Revision 2 closes the 38 points of the plan review; each
change cites its point as "review #n". It also adds a linker-graph replay of the algorithm on all 15 fixtures
(7.3), which confirmed the reviewer's findings and found one more difference from the design (monorepo, D-74).
A final consistency pass added `analysis.include_tests_in_metrics` to the module method (D-56, D-65) and
made the scale test's layer groups large enough for P2 to run (7.5).

Inputs:

- the research design `designs/inference.md` ("the design"; its sections are cited as §n);
- the Python prototypes in `m5/`;
- the code of `ir`, `graph`, `model`, `core` (configuration) and `engine`;
- the reviewer's probes in `probe/`;
- the replay harness `probe2/replay.probe.ts` and its output `probe2/replay.out.txt` (and
  `replay.prior.out.txt`, the D-74 variant). The harness is a scratch implementation of this plan's rules
  P0–P3, P5, P7, P8 (`publicApi`), P9, roles and layers. It runs on `analyzeStructure` output through a
  scratch Vitest configuration and changes no repository file. Its numbers are predictions; the goldens pin
  the production values.

Conventions used below:

- **D-nn** marks a decision on a point the design leaves open, states inconsistently, or that the code base
  constrains. D-01–D-62 come from revision 1; "(revised)" marks those revision 2 changes. D-63–D-74 are new.
  Section 4 explains every decision where it applies; section 9 lists those that need sign-off.
- Labels [ESTABLISHED], [KATEDRALA HEURISTIC] and [DERIVED] mean what they mean in the design. Code carries
  the same labels in TSDoc, docs/ALGORITHMS.md carries them in text, and every evidence description of a
  heuristic conclusion says that it is one (D-66).
- Unit names U1–U5 refer to the work split in section 6.
- Nothing in `site/` or `.claude/` changes. 8.4 lists the landing-page statements M5 makes untrue, for the
  site owner.

---

## 1. Scope

### 1.1 What milestone 5 delivers

1. **A new package, `@katedrala/inference`.** It depends on `ir`, `graph` and `model` only, as the packages
   table in docs/ARCHITECTURE.md already specifies, and lint enforces it (2.1). It provides:
   - components [DERIVED] (§2);
   - architectural roles from file names, class names, layer-named directories and configuration, written
     to `FileEntity.roles` (§4.2);
   - modules (§3):
     - declared modules have exact membership;
     - all other modules are inferred by prior-anchored refinement (P0–P9);
     - tests and declarations are attached to inferred modules for navigation, and every attachment is
       explained by `attached-files` evidence (D-64);
   - layers (§4): declared ones, or layers inferred from roles and layer-named directories, with ranks taken
     from the observed layer graph;
   - `confidence`, `evidence`, `reason` and a `method` string for every inferred module and layer (§5),
     worded as inference (D-66);
   - aggregated `dependencies` and `dependents` of components, modules and layers, computed on the metrics
     projection with `aggregateDependencies` from `@katedrala/model`.
2. **Configuration.** The `modules`, `layers` and `inference` sections, which core currently lists as
   reserved, get validators, defaults and glob resolution.
3. **Engine.** A new `analyzeArchitecture()` returns the structure plus the architecture sections.
   `analyzeStructure()` keeps its signature, its document and its analysis digest.
4. **Supporting changes:**
   - `ir`:
     - the inferred-module key derivation: the root is `.` also with a stem, and the directory part is
       escaped (3.5);
     - `canonicalJson` moves here from core (3.6);
     - TSDoc changes, some of them pre-release meaning changes (3.5), and regenerated schemas;
   - `model`: a way to visit a projection edge's underlying edges without allocating;
   - `core`: exports of the existing glob schemas; `canonicalJson` re-exported from `ir`.
5. **Documentation:**
   - a new docs/ALGORITHMS.md;
   - updates to docs/IR.md;
   - updates to docs/ARCHITECTURE.md: ADR-012, ADR-013, the ADR-007 wording and the pipeline description;
   - updates to docs/ROADMAP.md, CONTRIBUTING.md and the root README.md;
   - a landing-page follow-up list for the site owner (8.4).
6. **Tests:**
   - unit and property tests in each unit;
   - 21 of the 76 todo expectation keys in `tests/fixtures/structure.test.ts` become real checks;
   - per-fixture assertions taken from the linker-graph replay (7.3);
   - golden architecture sections for all 15 fixtures;
   - perturbation measurements that ALGORITHMS.md publishes;
   - a scale test.

### 1.2 What milestone 5 leaves to later milestones

| Not delivered | Where | Reason |
| --- | --- | --- |
| A complete `ArchitectureDocument` with `metrics`, `anomalies`, `violations`, `rules` and `endpoints` | M6–M8, frameworks | Filling those sections with `emptyMetricsReport()` and empty lists would publish zeros that read as measurements. M5 returns `ArchitectureSections`: the structural sections plus `components`, `modules` and `layers`. |
| The `metrics.projection` field | M6 | Aggregated dependencies are computed on the metrics projection *options*. M5 returns them as `ArchitectureAnalysis.projection`, and M6 writes the same value into `metrics.projection`. Both stages read one engine function, so they agree by construction. |
| Metrics (cohesion, modularity, instability, ...) | M6 | M5 computes only the signals its own confidence needs. |
| Anomalies built from inference evidence: upward dependencies, grab-bag and single-user files, misplaced files, boundary bypass | M7 | M5 emits the evidence with stable signal ids (`relocated-files`, `single-user-files`, `upward-dependencies`) and an import-based `publicApi` (D-63), which M7 consumes. |
| Rules: `groups`, `rules`, module and layer selectors, `include_inferred` | M8 | M8 depends on one requirement recorded here (§3.14, ADR-012): module selectors and `scope: modules` mean **declared** modules unless a rule opts in. |
| `docs/RULES.md` (rules and declared modules/layers, a design target) | M8 | D-73: rule semantics belong to the rules milestone. M5 records its one requirement in ADR-012, ROADMAP M8 and ALGORITHMS.md. |
| Framework detectors and the roles they assign | frameworks (alongside M7–M12) | M5 already consumes detector `RoleEntry`s as votes when present (tested with synthetic documents). No detector exists yet. Framework detection will run *before* inference (2.3). |
| Symbol-level roles (`SymbolEntity.roles`) as votes | frameworks | There is no producer yet. Whether detectors put roles on files or on classes is decided together with them. |
| `katedrala explain` rendering (§5.4) and CLI flags | M11 | M5 produces the complete `InferenceInfo` that rendering needs. |
| Matching modules across snapshots (`ModuleMatch.similarity`) | M10 | Ids derive from priors and are already stable. Diff pairs renamed and split modules later, and compares method strings (D-56). |
| Performance budgets and a benchmark harness at 100 000 files | M13 | M5 ships algorithms with bounded complexity and an opt-in full-size scale test. It reports measured times and heap without asserting them. |
| Calibrated weights, vocabularies for other naming cultures, the resolution sweep | post-v1, or rejected | There is no ground-truth corpus yet. Vocabularies are configurable. §3.2 rejected the resolution sweep. |
| Leiden instead of Louvain in P4 | possible later improvement | Louvain only splits oversized flat directories (P4). The final refinement of `@katedrala/graph.louvain` (a split into connected components) guarantees connected communities only. Leiden (Traag, Waltman & van Eck 2019, Table 1) guarantees more: γ-separated and γ-connected communities after every iteration, node optimality and subpartition γ-density once an iteration changes nothing, and uniform γ-density and subset optimality asymptotically. P4 merges small pieces afterwards and reports every piece as evidence, so M5 does not depend on those guarantees (review #29; revision 1 claimed the refinement "already gives what Leiden adds"). |
| Landing-page statements about inference (`site/`) | site owner, outside M5 | M5 does not modify `site/`. 8.4 lists every statement M5 makes untrue and how the ROADMAP status change is coordinated with them (review #9). |

---

## 2. Package layout

### 2.1 Dependency direction

```text
@katedrala/ir          (no dependencies)                  + canonicalJson, moved from core (3.6)
@katedrala/graph       (no dependencies)
@katedrala/model       → ir, graph
@katedrala/inference   → ir, graph, model                 NEW: no zod, no picomatch, no Node.js APIs
@katedrala/core        → ir, plugin-api                   + exports globSchema, globListSchema; re-exports canonicalJson
@katedrala/engine      → ..., model, core, inference      validators, glob resolution, orchestration
```

`@katedrala/inference` is a pure library over the IR and the model, so like `ir`, `graph` and `model` it runs
in any JavaScript environment. Configuration validation needs `zod` and the glob semantics of core
(`createPathMatcher`, `globPatternProblem`). The engine already depends on both, so it owns the validators of
the inference sections and turns globs into file lists before it calls inference (D-59, ADR-013). The design
has `@katedrala/inference` register the validators itself. This plan deviates for exactly this reason.

**Enforcement (review #32).** `tsconfig.base.json` sets `types: ["node"]` for every package, so the type
checker cannot keep Node.js out of inference. `eslint.config.js` (U1) therefore gets a block for
`packages/inference/src/**/*.ts` that excludes `**/*.test.ts` and `**/*test-support.ts`:

- `no-restricted-imports` and `@typescript-eslint/no-restricted-imports`:
  - the pattern `node:*`;
  - the Node.js built-ins by their bare names (`fs`, `path`, `os`, `crypto`, `url`, `util`, `worker_threads`);
  - `zod`, `picomatch`;
  - every workspace package other than `@katedrala/ir`, `@katedrala/graph` and `@katedrala/model`
    (`@katedrala/core`, `@katedrala/plugin-api`, `@katedrala/linker`, `@katedrala/adapter-typescript`,
    `@katedrala/engine`, and later packages through a pattern);
- `no-restricted-globals`: `process`, `Buffer`, `Intl`, `__dirname`;
- `no-restricted-properties`: `Math.random`, `Date.now`;
- `no-restricted-syntax`: calls of `localeCompare`, `toLocaleLowerCase`, `toLocaleUpperCase` and
  `toLocaleString`, and `new Date()`.

`pnpm check` runs lint, so the "browser-capable, deterministic" claim of ADR-013 is checked, not asserted.

### 2.2 Files and responsibilities

Every implementation file has a co-located `*.test.ts` owned by the same unit. The build configuration
excludes `*.test.ts` and `*test-support.ts`.

```text
packages/inference/
├── package.json, tsconfig.json, tsconfig.build.json     U1  package wiring (deps: ir, graph, model)
├── README.md                                            U5  public API, truth labels, link to ALGORITHMS.md
└── src/
    ├── index.ts                  U1 → U5  U1 PR 1 creates it with the configuration and settings exports
    │                                      (vitest alias, build); U5 owns it afterwards (3.3)
    ├── types.ts                  U1  every type that crosses a unit boundary (3.1)
    ├── vocabulary.ts             U1  default vocabularies, frozen (4.1.3)
    ├── settings.ts               U1  resolveInferenceSettings: defaults, normalization of configured names
    │                                 (D-69), "!" removals, merged maps, method strings (D-56), INFERENCE_KEYS
    ├── lexical.ts                U1  ASCII tokens (D-05), S-stemmer, name parts, file stem, plural
    ├── directories.ts            U1  directory kinds, DirectoryTree, sourceRoot, commonDirectory
    ├── weighted-graph.ts         U1  the weighted file graph of §1.3; restriction to node subsets
    ├── evidence.ts               U1  Evidence/InferenceInfo assembly: ordering, rounding, entity limits,
    │                                 confidence = Σ weight × value, number formatting for descriptions
    ├── test-support.ts           U1  synthetic documents and models, shuffling, prototype models: a port of
    │                                 m5/fixture_graph.py, barrel resolution and entry points included (6.1)
    ├── components.ts             U2  §2
    ├── roles.ts                  U2  §4.2 roles, layer votes and per-file labels; withRoles()
    ├── layers/
    │   ├── partition.ts          U2  layer membership, pruning, declared layers, overlap and empty warnings
    │   ├── order.ts              U2  layer graph, SCCs, exact ordering DP, greedy fallback,
    │   │                             conventional arcs, ranks
    │   ├── explain.ts            U2  layer confidence signals, evidence, reasons
    │   └── layers.ts             U2  inferLayers()
    ├── modules/
    │   ├── prior.ts              U3  P1 prior units
    │   ├── stems.ts              U3  P2 organization style and stem units
    │   ├── classes.ts            U3  P3 utilities, orchestrators, facades, and what triggered each (D-66)
    │   ├── split.ts              U3  P4 oversized units (Louvain)
    │   ├── reassign.ts           U3  P5 strict-majority reassignment
    │   ├── identity.ts           U3  P6 keys, anchors, names
    │   ├── cluster.ts            U3  clusterScope(): P1–P6 for one scope
    │   ├── reference.test-support.ts U3  naive reference implementations (P3 fixpoint, P5) for property tests
    │   ├── declared.ts           U4  §3.14 declared modules, overlaps
    │   ├── scopes.ts             U4  P0 scopes and per-scope graphs
    │   ├── attach.ts             U4  P7 tests and declarations (D-65)
    │   ├── surface.ts            U4  P8 entry points, public API (D-63), packages
    │   ├── confidence.ts         U4  P9 signals
    │   ├── explain.ts            U4  module evidence descriptions and reasons
    │   └── modules.ts            U4  inferModules()
    ├── infer.ts                  U5  inferArchitecture(): pipeline, cross-references, aggregated dependencies
    └── scale.test.ts             U5  scale test (7.5)
```

Changes outside the new package, by owner:

| File | Owner | Change |
| --- | --- | --- |
| `tsconfig.build.json` (root) | U1 | Reference `packages/inference/tsconfig.build.json`. |
| `package.json` (root), `pnpm-lock.yaml` | U1 | Add `@katedrala/inference` to the root devDependencies (the tests import it). Update the lockfile. |
| `packages/engine/package.json`, `packages/engine/tsconfig.build.json` | U1 | Add the dependency and project reference up front, so U5 never edits manifests and the lockfile has a single owner. |
| `eslint.config.js` | U1 | (a) The "numeric kernels" non-null-assertion exemption for `packages/inference/src/{weighted-graph,directories}.ts`, `packages/inference/src/modules/{prior,stems,classes,split,reassign,confidence}.ts` and `packages/inference/src/layers/{order,explain}.ts`: the typed-array loops (review #13). (b) The restriction block of 2.1 (review #32). Later additions go through U1. |
| `packages/ir/src/ids.ts`, `ids.test.ts` | U1 | Module key derivation (3.5 item 1). |
| `packages/ir/src/canonical-json.ts` (new) and its test, `packages/ir/src/index.ts` | U1 | `canonicalJson` moved from core (3.6). |
| `packages/core/src/util/canonical-json.ts` | U1 | Re-exports `canonicalJson` from `@katedrala/ir`; core's public API is unchanged. |
| `docs/IR.md` | U1 → U5 | U1 PR 1 writes the Identifiers text for module keys, which CONTRIBUTING requires in the same change as the derivation. U5 owns the file from then on and writes the semantic sections after U4 lands (review #14). |
| `packages/ir/src/types/architecture.ts`, `structure.ts`, `common.ts`; `packages/ir/schema/*.json` | U5 | TSDoc only (3.5), written after U4 lands, then one `pnpm schema` run (descriptions only). |
| `packages/model/src/projection.ts`, `projection.test.ts` | U1 | `forEachUnderlyingEdge` (3.6). |
| `packages/core/src/config/schema.ts`, `packages/core/src/index.ts` | U5 | Export `globSchema` and `globListSchema` (3.6). |
| `packages/engine/src/structure.ts` | U5 | `ANALYSIS_STAGES` gains `"inference"`; TSDoc (2.3). |
| `packages/engine/src/architecture.ts` (new) | U5 | `analyzeArchitecture`, `ArchitectureAnalysis`, `ArchitectureSections`. |
| `packages/engine/src/inference-configuration.ts` (new) | U5 | zod validators of `modules`, `layers`, `inference`; `INFERENCE_CONFIGURATION_SECTIONS`. |
| `packages/engine/src/declarations.ts` (new) | U5 | Globs → `Declarations`. |
| `packages/engine/src/projection.ts` (new) | U5 | `metricsProjectionOptions(settings)`, used now by inference and in M6 by metrics. |
| `packages/engine/src/index.ts` and new engine tests | U5 | Exports and tests. |
| `tests/fixtures/structure.test.ts`, `tests/fixtures/inference.test.ts` (new), `tests/fixtures/golden/*.json` (new) | U5 | Section 7. |
| `fixtures/dependency-violations/README.md` | U5 | Clarify that `moduleCycles` concerns declared modules (D-62). This file is not analyzer input: the test harness excludes fixture READMEs. |
| `docs/ALGORITHMS.md` (new), `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `CONTRIBUTING.md`, `README.md` (root) | U5 | Section 8. The root README has uncommitted working-tree changes (a "Get started" section); U5 builds on them and coordinates with their author instead of overwriting them (review #30). |

Ownership rules:

- Two files change owner once, at a fixed point: `packages/inference/src/index.ts` and `docs/IR.md` pass from
  U1 to U5 when U1 PR 1 merges. Ownership is disjoint at every point in time.
- `pnpm-lock.yaml` and `packages/ir/schema/*.json` are the generated files; each has one owner (U1, U5).
- The IR TSDoc of the architecture section is U5's because its semantics become observable only when U5's
  engine stage writes components, modules and layers into documents. The TSDoc and IR.md text then land in
  the same change as the behavior, as CONTRIBUTING requires, and after U2–U4 have settled them. Until then
  this plan (3.5) is their specification.

### 2.3 How the engine exposes the result

- **`analyzeStructure(options)` is unchanged.** It keeps its signature, its document, its analysis digest and
  its six progress stages. When it runs alone, the `modules`, `layers` and `inference` sections stay
  unvalidated and keep their current `configuration-warning` ("not evaluated by this version"), which is
  correct because the structure stage does not evaluate them.
- **`analyzeArchitecture(options)` is new.**
  1. It calls `analyzeStructure({ ...options, configurationSections: { ...INFERENCE_CONFIGURATION_SECTIONS,
     ...options.configurationSections } })`. It throws a `TypeError` if a caller tries to register one of
     the three inference sections itself, mirroring core's protection of its own sections.
  2. It runs a new pipeline stage, `"inference"`, which is timed into `run.timings.inference` and reported
     through `onProgress`:
     - resolve settings and declarations;
     - call `inferArchitecture()`;
     - merge the inferred roles into `files` (copy-on-write);
     - merge and sort diagnostics;
     - assemble the document.
  3. It builds an `ArchitectureModel` over the final document and returns it.
- **`ANALYSIS_STAGES` becomes** `["listing", "configuration", "discovery", "extraction", "projects",
  "linking", "inference"]`. Its TSDoc says (review #31): "Stages in execution order. `analyzeStructure` runs
  the stages up to `linking`. Later milestones insert their stages where their inputs require: framework
  detection runs before `inference`, because detector roles are layer votes; metrics, anomalies and rules
  run after it. Look stages up by name, never by position." docs/ARCHITECTURE.md says the same (8.3).
- **Validators never inject defaults,** and no inference semantics depend on the order of configuration keys
  (D-23). As a result, the canonical configuration JSON describes the configuration completely, and
  `snapshot.analysisDigest` is identical whether or not the inference validators are registered (D-61).

---

## 3. Types and interfaces

### 3.1 `packages/inference/src/types.ts` (owner U1)

All types that cross a unit boundary live in this one module. Implementation modules import data types from
it, and declare their exported functions with exactly the signatures listed in 3.2. U1 lands this file first
(section 6, order).

```ts
import type {
  ArchitecturalRole, ComponentEntity, Diagnostic, DocumentLimits, EdgeKind, EntityId, FileId, FileRole,
  LayerEntity, ModuleAnchor, ModuleEntity, PackageId, RoleEntry,
} from "@katedrala/ir";
import type { Digraph } from "@katedrala/graph";
import type { ArchitectureModel, ProjectionOptions } from "@katedrala/model";

// ─── Configuration as written (snake_case, ADR-010). Validated by @katedrala/engine. ────────────────

/** `modules.<name>`: a glob list (short form) or `{ files, entry }` (long form). */
export type DeclaredModuleConfiguration = string[] | { files: string[]; entry?: string[] };
/** The `modules` section, keyed by module name. Key order has no meaning: overlaps resolve by name (D-23). */
export type ModulesConfiguration = Record<string, DeclaredModuleConfiguration>;
export interface DeclaredLayerConfiguration { name: string; files: string[]; rank?: number }
/** The `layers` section, outermost layer first. Declaring layers disables layer inference. */
export type LayersConfiguration = DeclaredLayerConfiguration[];
/** The `inference` section. Every key is optional; defaults are applied by resolveInferenceSettings. */
export interface InferenceConfiguration {
  roles?: Partial<Record<ArchitecturalRole, string[]>>;
  components?: { file_roles?: FileRole[] };
  modules?: {
    enabled?: boolean;
    when_declared?: "infer-rest" | "none";
    file_roles?: FileRole[];
    /** A multiple of 1/1024 in [0, 1] (D-67). */
    type_only_weight?: number;
    min_edge_confidence?: number;
    max_module_files?: number;
    min_module_files?: number;
    stem_min_coverage?: number;
    utility_min_modules?: number;
    move_min_support?: number;
    move_min_weight?: number;
    max_passes?: number;
    attach_tests?: boolean;
    attach_declarations?: boolean;
    container_directories?: string[];
    shared_directories?: string[];
    generic_tokens?: string[];
  };
  layers?: {
    enabled?: boolean;
    directory_layers?: Record<string, string | null>;
    role_layers?: Record<string, string | null>;
    naming_suffixes?: Record<string, ArchitecturalRole | null>;
    conventional_tiers?: string[][];
    min_label_score?: number;
    min_layer_files?: number;
    exact_order_max_layers?: number;
  };
}
/** The sections of `inference`, for `satisfies` checks of the validators (5.2). */
export type ComponentInferenceConfiguration = NonNullable<InferenceConfiguration["components"]>;
export type ModuleInferenceConfiguration = NonNullable<InferenceConfiguration["modules"]>;
export type LayerInferenceConfiguration = NonNullable<InferenceConfiguration["layers"]>;

// ─── Effective settings ───────────────────────────────────────────────────────────────────────────────

/** Entries are normalized as D-69 specifies: ASCII-lower-cased, then S-stemmed except containers. */
export interface Vocabulary {
  /** Exact lower-case directory names that are containers (D-07). */
  readonly containers: ReadonlySet<string>;
  /** S-stemmed keys of shared directory names. */
  readonly shared: ReadonlySet<string>;
  /** S-stemmed directory key → layer name (§4.3). Its keys are the "layer" directory kind. */
  readonly directoryLayers: ReadonlyMap<string, string>;
  /** S-stemmed naming suffix → architectural role (§4.2). */
  readonly namingSuffixes: ReadonlyMap<string, ArchitecturalRole>;
  /** Role → layer name; null = cross-cutting (the label ⊥). Roles absent from the map vote ⊥. */
  readonly roleLayers: ReadonlyMap<ArchitecturalRole, string | null>;
  /** Layer name → the role a location vote produces (unique inverse of roleLayers, D-18). */
  readonly locationRoles: ReadonlyMap<string, ArchitecturalRole>;
  /** S-stemmed tokens that never form a file stem: generic tokens ∪ naming-suffix keys (D-09). */
  readonly nonStemTokens: ReadonlySet<string>;
  /** Layer name → conventional tier, 0 = outermost; layers without a tier are absent. */
  readonly tiers: ReadonlyMap<string, number>;
}
/** typeOnlyWeight is a multiple of 1/1024, so every weight sum is exact (D-67). */
export interface EdgeWeighting { readonly typeOnlyWeight: number; readonly minEdgeConfidence: number }
export interface ModuleSettings {
  readonly enabled: boolean;
  readonly whenDeclared: "infer-rest" | "none";
  readonly fileRoles: ReadonlySet<FileRole>;
  readonly maxModuleFiles: number;
  readonly minModuleFiles: number;
  readonly stemMinCoverage: number;
  readonly utilityMinModules: number;
  readonly moveMinSupport: number;
  readonly moveMinWeight: number;
  readonly maxPasses: number;
  readonly attachTests: boolean;
  readonly attachDeclarations: boolean;
  /**
   * `analysis.include_tests_in_metrics`: the metrics projection counts tests, so tests are attached by
   * strict majority only, like declarations, which it always counts (D-65). Part of the module method (D-56).
   */
  readonly testsInMetrics: boolean;
}
export interface LayerSettings {
  readonly enabled: boolean;
  readonly minLabelScore: number;
  readonly minLayerFiles: number;
  readonly exactOrderMaxLayers: number;
}
export interface InferenceSettings {
  readonly componentFileRoles: ReadonlySet<FileRole>;
  readonly weighting: EdgeWeighting;
  readonly modules: ModuleSettings;
  readonly layers: LayerSettings;
  readonly vocabulary: Vocabulary;
  /** `InferenceInfo.method` values, with the non-default parameters that can change them (D-56). */
  readonly methods: { readonly modules: string; readonly layers: string };
}

// ─── Declarations (globs resolved to files by the engine) ─────────────────────────────────────────────

export interface DeclaredModuleSpec {
  readonly name: string;
  /** Every file matched by the `files` globs, sorted. Role filtering is inference's job (D-22). */
  readonly files: readonly FileId[];
  /** Files matched by the `entry` globs, sorted; absent when `entry` is not configured. */
  readonly entry?: readonly FileId[];
}
export interface DeclaredLayerSpec {
  readonly name: string;
  /** Explicit `rank`, else the position in the list. */
  readonly rank: number;
  readonly files: readonly FileId[];
}
export interface ConfiguredRoleSpec { readonly role: ArchitecturalRole; readonly files: readonly FileId[] }
export interface Declarations {
  /** Sorted by name (D-23). */
  readonly modules: readonly DeclaredModuleSpec[];
  /** Configuration order; absent = layers are inferred. */
  readonly layers?: readonly DeclaredLayerSpec[];
  /** Sorted by role. */
  readonly roles: readonly ConfiguredRoleSpec[];
  /** The configuration file when it is a file of the snapshot (location of configuration warnings). */
  readonly configurationFile?: FileId;
}

// ─── Weighted file graph (§1.3) ───────────────────────────────────────────────────────────────────────

export interface WeightedGraphOptions extends EdgeWeighting {
  readonly edgeKinds: ReadonlySet<EdgeKind>;
  readonly fileRoles: ReadonlySet<FileRole>;
  /** Files that are not nodes (declared-module files during module inference). */
  readonly exclude?: ReadonlySet<FileId>;
}
export interface WeightedFileGraph {
  /** Sorted by UTF-16 code units. */
  readonly nodes: readonly FileId[];
  /** Node number of a file; -1 when it is not a node. */
  indexOf(file: FileId): number;
  /**
   * w(u, v) > 0 in CSR form (both directions, rows ascending): 1 when some admitted edge is a runtime edge,
   * else typeOnlyWeight. Weights are dyadic (D-67), so sums and comparisons of sums are exact.
   */
  readonly graph: Digraph;
  /** Per node: distinct node targets reached by an admitted projection edge (weight 0 included)... */
  readonly admittedOutDegree: Int32Array;
  /** ...and how many of those carry the `re-exports` kind (facade test, P3). */
  readonly reexportOutDegree: Int32Array;
}

// ─── Lexical and directory helpers ────────────────────────────────────────────────────────────────────

/** text: original spelling; key: ASCII-lower-cased (D-05). */
export interface Token { readonly text: string; readonly key: string }
export interface NameParts { readonly head: string; readonly qualifiers: readonly string[] }
export interface StemToken { readonly stem: string; readonly original: string }
export type DirectoryKind = "container" | "layer" | "shared" | "feature";

// ─── Roles and per-file layer labels (§4.2, §4.3) ─────────────────────────────────────────────────────

export type VoteSource = "configuration" | "detector" | "naming" | "location";
export type RoleSignal =
  | "configured-glob" | "detector-role" | "name-qualifier" | "name-suffix" | "type-name-suffix" | "directory-name";
export interface LayerVote {
  /** null = ⊥ (a role without a layer). */
  readonly label: string | null;
  readonly confidence: number;
  readonly source: VoteSource;
  /** The RoleEntry.source: a detector id, "naming", "location" or "configuration". */
  readonly producer: string;
  /** Absent for a location vote of a directory without a role (e.g. `domain`). */
  readonly role?: ArchitecturalRole;
  readonly signal: RoleSignal;
  /** The directory, symbol or file that carries the evidence. */
  readonly subject?: EntityId;
}
export interface FileLabel {
  readonly file: FileId;
  /** Sorted by source precedence, then label, then signal. */
  readonly votes: readonly LayerVote[];
  /** The winning label when its score ≥ minLabelScore, else null. */
  readonly label: string | null;
  /** Score of the winning label, noisy-OR across sources (D-14). */
  readonly score: number;
  /** The outermost layer-kind directory below the source root (D-18). */
  readonly location?: { readonly label: string; readonly directory: string };
}
export interface RolesInput {
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  readonly configured: readonly ConfiguredRoleSpec[];
}
export interface RolesResult {
  /** naming, location and configuration entries per file, canonical order (role, then source). */
  readonly roles: ReadonlyMap<FileId, readonly RoleEntry[]>;
  /** Every source file with at least one vote. */
  readonly labels: ReadonlyMap<FileId, FileLabel>;
}

// ─── Stage drafts (dependency lists and cross-references are filled by infer.ts, U5) ─────────────────

export type ComponentDraft = Omit<ComponentEntity, "modules" | "dependencies" | "dependents">;
export type ModuleDraft = Omit<ModuleEntity, "components" | "dependencies" | "dependents">;
export type LayerDraft = Omit<LayerEntity, "dependencies" | "dependents">;

export interface ComponentsInput {
  readonly model: ArchitectureModel;
  readonly fileRoles: ReadonlySet<FileRole>;
  readonly repositoryName: string;
}

// ─── Module clustering (U3 → U4) ──────────────────────────────────────────────────────────────────────

export type ScopeId = PackageId | "";
export interface Scope {
  readonly id: ScopeId;
  /** Package path; "" without a package. */
  readonly directory: string;
  /** Declared name of the scope package. */
  readonly packageName?: string;
  /** The scope's inference nodes and the edges among them. */
  readonly graph: WeightedFileGraph;
}
export interface ClusteringContext {
  readonly settings: InferenceSettings;
  /** For stem names (entity rule, D-39). */
  readonly labels: ReadonlyMap<FileId, FileLabel>;
  /** Files of document.entryPoints (D-31). */
  readonly entryPoints: ReadonlySet<FileId>;
  readonly repositoryName: string;
}
export type UnitKind = "root" | "feature" | "layer" | "shared" | "stem" | "split";
export type OrganizationStyle = "feature" | "layer" | "mixed" | "none";
export interface GroupOrganization {
  /** A directory split by P1. */
  readonly directory: string;
  readonly style: OrganizationStyle;
  readonly layerChildren: readonly string[];
  readonly featureChildren: readonly string[];
  readonly sharedChildren: readonly string[];
  /** Sorted. */
  readonly recurrentStems: readonly string[];
  /** Nodes of recurrent stems. */
  readonly coveredFiles: number;
  /** Nodes below layer children. */
  readonly layerFiles: number;
  /** Whether stem units were formed. */
  readonly stemsApplied: boolean;
}
export interface ClusterUnit {
  /** inferredModuleKey(anchor), without `~inferred`. */
  readonly key: string;
  /** For pieces without a stem, `stem` is the fallback of D-34. */
  readonly anchor: ModuleAnchor;
  readonly kind: UnitKind;
  readonly name: string;
  /** Final node members (scope-local indices), ascending. */
  readonly members: Int32Array;
  /** Members after P2 and P4, before P5, ascending. */
  readonly prior: Int32Array;
  /** The split directory whose organization formed the unit. */
  readonly group?: string;
  /** P4: the directory that was split. */
  readonly oversized?: { readonly directory: string; readonly nodes: number };
  readonly destination: boolean;
}
export interface Relocation {
  readonly node: number;
  /** Prior unit key. */
  readonly from: string;
  /** Final unit key. */
  readonly to: string;
  /** At the file's last move, per unit key. */
  readonly dependents: ReadonlyMap<string, { readonly weight: number; readonly files: number }>;
  readonly dependencies: ReadonlyMap<string, number>;
}
/** The classes of P3 and what triggered each, so that U4 can word the evidence (D-66). */
export interface StructuralClasses {
  /** Per scope node: 1 = composition root. */
  readonly orchestrators: Uint8Array;
  /** Per scope node: 0 = none, 1 = entry-point rule, 2 = shape rule (the two orchestrator rules). */
  readonly orchestratorRule: Uint8Array;
  /** Shape rule: number of other units the node's non-utility dependencies reach. */
  readonly dependencyUnits: Int32Array;
  /** Final utilities (orchestrators ignored as dependents). */
  readonly utilities: Uint8Array;
  /** Utilities: number of other prior units among the node's non-orchestrator dependents. */
  readonly dependentUnits: Int32Array;
  readonly facades: Uint8Array;
}
export interface ScopeClustering {
  readonly scope: Scope;
  readonly sourceRoot: string;
  /** Non-empty, sorted by key, keys unique. */
  readonly units: readonly ClusterUnit[];
  /** Scope node → index into units. */
  readonly unitOf: Int32Array;
  readonly classes: StructuralClasses;
  /** Sorted by directory. */
  readonly groups: readonly GroupOrganization[];
  /** Files whose final unit differs from their prior unit, by node. */
  readonly relocations: readonly Relocation[];
  readonly passes: number;
  /** false when P5 stopped at maxPasses with moves pending. */
  readonly converged: boolean;
}

// ─── Stage inputs and results ─────────────────────────────────────────────────────────────────────────

export interface ModulesInput {
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  readonly declared: readonly DeclaredModuleSpec[];
  readonly labels: ReadonlyMap<FileId, FileLabel>;
  /** The metrics projection, for publicApi (D-63). The attachment policy reads settings (D-65). */
  readonly projection: ProjectionOptions;
  readonly repositoryName: string;
  readonly limits: DocumentLimits;
  readonly configurationFile?: FileId;
}
export interface ModulesResult { readonly modules: readonly ModuleDraft[]; readonly diagnostics: readonly Diagnostic[] }
export interface LayersInput {
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  /** The metrics projection: its edge kinds are those of the layer graph. */
  readonly projection: ProjectionOptions;
  readonly labels: ReadonlyMap<FileId, FileLabel>;
  readonly declared?: readonly DeclaredLayerSpec[];
  readonly limits: DocumentLimits;
  readonly configurationFile?: FileId;
}
export interface LayersResult { readonly layers: readonly LayerDraft[]; readonly diagnostics: readonly Diagnostic[] }

// ─── Evidence assembly (U1 → U2, U4) ──────────────────────────────────────────────────────────────────

export interface WeightedSignal {
  readonly signal: string;
  readonly weight: number;
  /** Absent = the signal could not be computed; it contributes 0 (D-45). */
  readonly value?: number;
  readonly description: string;
  readonly entities?: readonly EntityId[];
}
export interface ContextSignal {
  readonly signal: string;
  readonly description: string;
  readonly value?: number;
  readonly entities?: readonly EntityId[];
}
export interface InferenceInfoInput {
  readonly method: string;
  /** Begins with "Inferred:" (D-66). */
  readonly reason: string;
  readonly weighted: readonly WeightedSignal[];
  readonly context: readonly ContextSignal[];
  /** limits.maxEvidenceEntities */
  readonly maxEntities: number;
}

// ─── Top level (U5) ───────────────────────────────────────────────────────────────────────────────────

export interface InferenceInput {
  /** A model over the structural sections; existing units are ignored (D-20). */
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  readonly declarations: Declarations;
  /** The metrics projection. Aggregated dependencies are computed on it. */
  readonly projection: ProjectionOptions;
  readonly repositoryName: string;
}
export interface InferenceResult {
  readonly roles: ReadonlyMap<FileId, readonly RoleEntry[]>;
  /** Canonical order, dependency lists filled. */
  readonly components: ComponentEntity[];
  readonly modules: ModuleEntity[];
  readonly layers: LayerEntity[];
  readonly diagnostics: Diagnostic[];
  /**
   * A model over the structural sections plus the final units, with their dependency lists empty. Later
   * stages (M6) reuse it for unit-level projections, so the document index is not rebuilt (D-60).
   */
  readonly unitsModel: ArchitectureModel;
}
```

### 3.2 Functions and constants that cross unit boundaries

| Signature | File | Owner | Used by |
| --- | --- | --- | --- |
| `resolveInferenceSettings(config?: InferenceConfiguration, core?: { readonly includeTestsInMetrics?: boolean }): InferenceSettings` | settings.ts | U1 | U5 (engine, which passes the same `EffectiveCoreSettings` field it builds the metrics projection from), tests |
| `INFERENCE_KEYS: { readonly components: readonly (keyof ComponentInferenceConfiguration)[]; readonly modules: readonly (keyof ModuleInferenceConfiguration)[]; readonly layers: readonly (keyof LayerInferenceConfiguration)[]; readonly sections: readonly (keyof InferenceConfiguration)[] }` | settings.ts | U1 | U5 (validator key test, method-coverage test, docs) |
| `normalizeVocabularyName(list: "containers" \| "shared" \| "generic" \| "directory-layers" \| "naming-suffixes", name: string): string` | settings.ts | U1 | U5 (validator: names that normalize to the same key, D-69) |
| `DEFAULT_INFERENCE_CONFIGURATION: Readonly<Required<InferenceConfiguration>>` (vocabularies as sorted arrays and objects; `roles` empty) | settings.ts | U1 | U5 (validator round trip, docs) |
| `asciiLower(text: string): string` | lexical.ts | U1 | U2, U3 |
| `tokenize(text: string): Token[]` | lexical.ts | U1 | U2, U3 |
| `sStem(word: string): string` | lexical.ts | U1 | U2, U3, U5 (tests) |
| `nameParts(fileName: string): NameParts` | lexical.ts | U1 | U2, U3 |
| `fileStem(path: string, vocabulary: Vocabulary): StemToken \| undefined` | lexical.ts | U1 | U3 |
| `pluralize(word: string): string` | lexical.ts | U1 | U3 |
| `directoryKind(name: string, vocabulary: Vocabulary): DirectoryKind` | directories.ts | U1 | U2, U3 |
| `class DirectoryTree { static fromPaths(paths: readonly string[]): DirectoryTree; children(dir: string): readonly string[]; directFiles(dir: string): readonly number[]; subtreeSize(dir: string): number }` | directories.ts | U1 | U2, U3, U4 |
| `sourceRoot(scopeDirectory: string, filePaths: readonly string[]): string` | directories.ts | U1 | U2, U3 |
| `commonDirectory(paths: readonly string[]): string` | directories.ts | U1 | U4 |
| `buildWeightedFileGraph(model: ArchitectureModel, options: WeightedGraphOptions): WeightedFileGraph` | weighted-graph.ts | U1 | U2, U4 |
| `restrictWeightedGraph(graph: WeightedFileGraph, nodes: Int32Array): WeightedFileGraph` | weighted-graph.ts | U1 | U4 |
| `inferenceInfo(input: InferenceInfoInput): InferenceInfo` | evidence.ts | U1 | U2, U4 |
| `formatPercent(x: number): string`, `formatNumber(x: number, digits: number): string`, `formatList(items: readonly string[]): string` | evidence.ts | U1 | U2, U4 |
| `inferComponents(input: ComponentsInput): ComponentDraft[]` | components.ts | U2 | U5 |
| `inferRoles(input: RolesInput): RolesResult` | roles.ts | U2 | U5 (labels feed U3, U4) |
| `withRoles(files: readonly FileEntity[], roles: ReadonlyMap<FileId, readonly RoleEntry[]>): FileEntity[]` | roles.ts | U2 | U5 (engine) |
| `inferLayers(input: LayersInput): LayersResult` | layers/layers.ts | U2 | U5 |
| `clusterScope(scope: Scope, context: ClusteringContext): ScopeClustering` | modules/cluster.ts | U3 | U4 |
| `inferModules(input: ModulesInput): ModulesResult` | modules/modules.ts | U4 | U5 |
| `inferArchitecture(input: InferenceInput): InferenceResult` | infer.ts | U5 | engine |
| `canonicalJson(value: unknown): string` | `@katedrala/ir` canonical-json.ts | U1 | U1 (method-string hashes, D-56), core (re-export) |

Phase functions inside U3 and U4 (`priorUnits`, `applyStemUnits`, `structuralClasses`, `splitOversized`,
`reassign`, `identifyUnits`, `attachFiles`, `moduleSurface`, `moduleSignals`) are internal to their unit.
They are exported only so their own tests can reach them.

### 3.3 Public API of `@katedrala/inference` (`index.ts`, U1 then U5)

U1 PR 1 creates `index.ts` with the configuration and settings exports, which U5's validators need early:
the configuration types, `InferenceSettings` and its parts, `resolveInferenceSettings`, `INFERENCE_KEYS`,
`normalizeVocabularyName`, `sStem` and `DEFAULT_INFERENCE_CONFIGURATION`. U5 owns the file afterwards and
adds the rest. The final package exports:

- `inferArchitecture` and `resolveInferenceSettings`;
- `sStem`, the normalization the vocabularies use. Fixture tests and the CLI's explain need it;
- `INFERENCE_KEYS` and `normalizeVocabularyName`, which the engine's validators use;
- the types `InferenceConfiguration` (and its section types), `ModulesConfiguration`, `LayersConfiguration`,
  `DeclaredModuleConfiguration`, `DeclaredLayerConfiguration`, `Declarations` (and its specs),
  `InferenceSettings` (and its parts), `InferenceInput` and `InferenceResult`;
- `DEFAULT_INFERENCE_CONFIGURATION`: every key of the `inference` section at its default, vocabularies
  included, as frozen plain JSON (sorted arrays and objects). It feeds the configuration reference in
  ALGORITHMS.md and the validator round-trip test (5.2). It replaces revision 1's `DEFAULT_VOCABULARY`.

Everything else is internal.

### 3.4 Engine API (owner U5)

```ts
/** The structural sections plus the architectural view. Valid against the strict schema once merged with emptyDocument(). */
export type ArchitectureSections = StructureDocument & Pick<ArchitectureDocument, "components" | "modules" | "layers">;

export interface ArchitectureAnalysis {
  /** Canonical; `files[].roles` include inferred roles. */
  readonly document: ArchitectureSections;
  /** A view of `document`. */
  readonly model: ArchitectureModel;
  /** Includes `timings.inference`. */
  readonly run: RunInfo;
  readonly configuration: SnapshotConfiguration;
  readonly settings: EffectiveCoreSettings;
  readonly inference: InferenceSettings;
  /** The projection aggregated dependencies were computed on. M6 writes it to metrics.projection. */
  readonly projection: ProjectionInfo;
}

export async function analyzeArchitecture(options?: AnalyzeOptions): Promise<ArchitectureAnalysis>;
/** zod validators registered by analyzeArchitecture; exported so tools can validate a configuration without analyzing. */
export const INFERENCE_CONFIGURATION_SECTIONS: {
  readonly modules: z.ZodType<ModulesConfiguration>;
  readonly layers: z.ZodType<LayersConfiguration>;
  readonly inference: z.ZodType<InferenceConfiguration>;
};
/** Internal, exported for tests and for M6. */
export function metricsProjectionOptions(settings: EffectiveCoreSettings): ProjectionOptions;
export function resolveDeclarations(
  files: readonly FileEntity[],
  sections: { modules?: ModulesConfiguration; layers?: LayersConfiguration; inference?: InferenceConfiguration },
  configurationFile?: FileId,
): Declarations;
```

`metricsProjectionOptions` returns:

- `edgeKinds`: `DEFAULT_EDGE_KINDS`;
- `includeTypeOnly`: `settings.includeTypeOnly`;
- `fileRoles`: `DEFAULT_FILE_ROLES` (`declaration`, `source`), plus `test` when
  `settings.includeTestsInMetrics`.

`ArchitectureAnalysis.projection` is `toProjectionInfo(metricsProjectionOptions(settings))`.

### 3.5 IR types touched

No structural change: there is no new field, enumeration value or union branch. Concretely:

- the overlap warnings use the existing `configuration-warning` code (D-24);
- the module kind is expressed as evidence, not as a field (D-48).

Several changes below are **pre-release meaning changes**: the IR policy would call them major (a field's
meaning or an identifier derivation changes). They are labelled as such here and in IR.md. Following the
precedent of milestones 2–4, `IR_SCHEMA_VERSION` stays `1.0.0` before the first release (Q-8): no document
with components, modules or layers has been produced yet (review #33). Owners: item 1 is U1 (PR 1); items
2–8 are TSDoc owned by U5 and written after U4 lands (2.2).

1. **Module key derivation** (`packages/ir/src/ids.ts`, `inferredModuleKey`; identifier-derivation change,
   pre-release; review #19):
   - The directory part is the normalized anchor directory with `%` written `%25`, `#` written `%23` and `~`
     written `%7E`, the encodings identifiers already use (`%25` and `%23` in the path part of symbol
     identifiers, `%7E` in name segments). Directory `src/a#b` gives `src/a%23b` and no longer collides
     with group `src/a` plus stem `b` (`src/a#b`), which would make `canonicalizeDocument` throw
     `DuplicateIdError`. A directory ending in `~inferred` can no longer imitate the collision suffix.
   - The analysis root is written `.` also when a stem is present: `{ directory: "", stem: "payment" }` gives
     `.#payment` (today `#payment`). docs/IR.md already states "the root directory is written `.`".
   - Stems never contain `%`, `#`, `~` or `/` (D-05, D-34), so the part after `#` needs no escaping.
   - `ids.test.ts` cases: `.#payment`; `src/a%23b` against `src/a#b`; `src/x%7Einferred`; `src/50%25`;
     `~inferred` on collision.
2. **`ComponentEntity`** (TSDoc; `name` is a pre-release meaning change):
   - interface: "A physical architectural unit, derived (never inferred): the analysis root, a package root, a
     directory that directly contains code, or a directory where code branches into two or more
     subdirectories. Chains of directories without code collapse into their deepest member (see
     docs/ALGORITHMS.md, "Components")."
   - `name`: "Package components: the package's declared name. The analysis root of a repository without a
     root manifest: the repository name. Other directories: the path relative to the parent component — the
     directory name, or several segments when directories without code were collapsed (e.g.
     `presentation/http`)."
3. **`ModuleAnchor`** (TSDoc; pre-release meaning changes):
   - interface: "What an inferred module's identity and name derive from: its prior (see docs/ALGORITHMS.md,
     "Modules")."
   - `directory`: "The directory of the module's prior: the directory the module was formed from, or the
     directory across whose layer subdirectories a file-name stem recurs. It contains most member files when
     the module is formed and is kept when files move in or out (reported as `anchor-drift` evidence), so
     that identities are stable." Today's text, "the directory most member files share", is no longer
     guaranteed after relocations.
   - `stem`: "The S-stemmed first token the member file names share, ASCII letters lower-cased (e.g.
     `payment`), for modules that cut across directories or that are pieces of an oversized directory. A
     piece without a common stem uses the hyphen-joined tokens of its smallest member's file name (e.g.
     `format-date-ts`), or a 16-hex-digit hash when that is taken (D-34)."
4. **`ModuleEntity`** (TSDoc):
   - `files`: "Member files, sorted. Inferred modules: the files inference assigned (by default production
     code) plus tests and declarations attached for navigation; declarations, and tests counted in metrics,
     are attached only by a strict majority of their dependents or dependencies (see docs/ALGORITHMS.md).
     Declared modules: the configured matches with a role components own. Every file belongs to at most one
     module."
   - `packages` (pre-release meaning change): "Packages owning member files, sorted. Declared modules may span
     packages; inferred modules never do." Today's text says "Modules may span packages".
   - `publicApi`: the text stays "Member files that files of other modules import or re-export from (actual
     usage). Sorted." It gains: "Computed from `imports` and `re-exports` edges, with the metrics projection's
     file roles and type-only setting; attached files are never listed." This is now implemented as written
     (D-63; review #1).
   - `inference`: "Present for inferred modules; `method` is `katedrala/module-inference@1`, followed by the
     non-default parameters that can change the result."
5. **`LayerEntity`** (TSDoc): `files` "Member files (production code), sorted."; `inference` "Present for
   inferred layers; `method` is `katedrala/layer-inference@1`, followed by the non-default parameters that
   can change the result."
6. **`FileEntity.roles`, `SymbolEntity.roles`** (TSDoc): "sorted by role, then source". This matches what
   `canonicalizeDocument` already does; the TSDoc says only "by role".
7. **`RoleEntry.source`**: unchanged. Its TSDoc already reads "The producer: a framework detector id (e.g.
   `nestjs`), `naming`, `location` or `configuration`" (revision 1 wrongly listed it as a change).
8. **`InferenceInfo`** (TSDoc, `common.ts`):
   - `method`: the example becomes `katedrala/module-inference@1`, with the sentence "When parameters that
     can change the result differ from their defaults, the identifier is followed by `?` and those parameters
     as `key=value` pairs joined by `&`, keys sorted (see docs/IR.md)."
   - `evidence` (review #34): "Weighted observations (those with a `weight`) first, by decreasing
     `weight × value` (an absent value counts 0), then by `signal`; then unweighted observations by `signal`,
     then `description`, then `value` (absent first), then `entities` compared element-wise."
   - `Evidence.signal` example: `internal-edge-ratio`.

After these changes, `pnpm schema` regenerates every schema. Only descriptions change.

### 3.6 Model, core and IR helper changes

- **`@katedrala/model`, `Projection`:**
  `forEachUnderlyingEdge(edgeIndex: number, visit: (edge: EdgeEntity) => void): void`. It visits the
  underlying IR edges of out-edge `edgeIndex` in id order, without allocating, and does nothing for an
  invalid index. `edgeInfoAt` builds a summary object per call (a slice, a Map and a sort). At 10^6 edges,
  per-pair weighting and the facade test would otherwise allocate millions of objects. The method is
  additive, documented and tested.
- **`@katedrala/core`:** `globSchema` and `globListSchema`, private in `config/schema.ts` today, are exported
  from `config/schema.ts` and from the package index (U5). Glob validation messages are then identical in
  every section. No behavior changes.
- **`canonicalJson` moves to `@katedrala/ir`** (review #11; U1 PR 1). Method strings hash effective
  vocabularies (D-56), and inference cannot depend on core. Two implementations of canonical JSON would be
  one too many, and plain `JSON.stringify` is not canonical: it puts integer-like keys first (a directory
  named `2024` in `directory_layers`). `packages/ir/src/canonical-json.ts` takes core's implementation and
  tests unchanged; `packages/core/src/util/canonical-json.ts` re-exports it, so core's API and every digest
  stay byte-identical.

---

## 4. Algorithms

Each part names the design section, the functions and files that implement it, the data structures, the
complexity, and the decisions (D-nn) that settle the design's open points.

### 4.1 Shared definitions (§1.3, §1.4)

#### 4.1.1 Weighted file graph (§1.3): `buildWeightedFileGraph` (U1)

1. Take `p = model.projection({ level: "file", edgeKinds, includeTypeOnly: true, fileRoles })`. The model
   memoizes it, so the identical specification is shared with any later caller.
2. The nodes are `p.nodes` minus `exclude`. They are already sorted.
3. For every out-edge `e = (u → v)` of `p.graph` in CSR order with both endpoints kept, visit the underlying
   edges with `forEachUnderlyingEdge(e)`:
   - *admitted* means `edge.confidence ≥ minEdgeConfidence`;
   - `anyAdmitted`, `anyRuntime = admitted ∧ ¬typeOnly` and `anyReexport = admitted ∧ kind = "re-exports"`
     are tracked per pair;
   - if `anyAdmitted`, increment `admittedOutDegree[u]`, and `reexportOutDegree[u]` when `anyReexport`;
   - the weight is `anyRuntime ? 1 : typeOnlyWeight`, and the pair becomes an edge only when the weight is
     greater than 0.
4. `Digraph.fromEdges(n, sources, targets, weights)`. The pairs are distinct and sorted by (u, v), so out-edge
   *i* of the graph is pair *i*.
5. `restrictWeightedGraph(g, nodes)` builds the induced subgraph with re-indexed nodes. It uses
   `Digraph.inducedSubgraph`, which returns `{ graph, mapping }`, and carries the degree arrays along.

Cost: time O(n + m_IR), memory O(n + m).

- **D-01 (`min_edge_confidence` semantics).** §1.3 says "0 if every underlying edge has confidence < 0.5,
  else 1.0 if `runtimeEdgeCount > 0`", but `runtimeEdgeCount` also counts low-confidence edges. The plan
  filters first: only admitted edges decide runtime against type-only. A 0.3-confidence runtime edge next
  to a 0.9 type-only edge therefore gives `typeOnlyWeight`, not 1.0.
- **D-02 (which projection).** The edge kinds are the metrics projection's (`DEFAULT_EDGE_KINDS`), as the
  design intends. `includeTypeOnly` is always true, independently of `analysis.include_type_only`, because
  inference controls type-only edges through `type_only_weight` (0 disables them). This holds for layer
  ordering as well (D-51).
- **D-03 (cross-scope edges).** P0 builds one graph over all module nodes and restricts it per scope with
  `restrictWeightedGraph`. P1–P9 therefore never see an edge to another package, which is what §1.3 and §3.4
  require.
- **D-04 (facade degrees).** §3.7 counts "outgoing projection edges". The plan counts *admitted* projection
  edges, including those whose weight is 0 because `type_only_weight = 0`. A type-only barrel is then still a
  facade.
- **D-67 (exact arithmetic; review #17).** Every majority, tie and threshold comparison of the algorithm
  compares sums of edge weights: P3's 50 % and 25 % conditions, P4's strongest neighbour, P5's five
  conditions, D-47's contested members, the layer DP and its tie rule. The weights are 1 and
  `type_only_weight`. The validator accepts `type_only_weight` only as a multiple of 1/1024 in [0, 1]
  (`Number.isInteger(w * 1024)`), so every weight is a dyadic rational and every sum of fewer than 2^43
  weights is exact in float64. Mathematically equal sums therefore compare equal whatever the summation
  order, which makes the DP-against-brute-force property and the tie rules reliable. Comparisons are written
  on sums (`inW[C] > 0.5 * total`, `max ≤ 0.5 * total`, `own ≤ 0.25 * total`; multiplying by 0.5 or 0.25 is
  exact), never on quotients. Quotients (shares, ratios, confidences) are computed once from exact sums and
  only reported. The two remaining threshold comparisons on quotients are exact at their boundaries:
  coverage is the correctly rounded quotient `kept / below` compared with `stem_min_coverage` (3/10 against
  0.3 compares equal), and label scores are compared after `roundMetric` (D-14). Property tests draw
  weights from the 1/1024 lattice. Q-12 records the alternative (quantize instead of reject).

#### 4.1.2 Lexical definitions (§1.4): `lexical.ts` (U1)

- **`tokenize(text)`** (ASCII-only, D-05):
  - It splits on runs of characters that are neither ASCII letters, ASCII digits nor non-ASCII characters
    (`[^A-Za-z0-9\u0080-\uFFFF]+`).
  - It then splits at ASCII camel-case boundaries: `(?<=[a-z0-9])(?=[A-Z])` and `(?<=[A-Z])(?=[A-Z][a-z])`.
  - It keeps `text` (the original spelling) and `key = asciiLower(text)`. `asciiLower` maps `A`–`Z` to
    `a`–`z` and leaves every other character unchanged.
  - Examples: `OrderLine` gives `Order`/`order` and `Line`/`line`; `HTTPServer` gives `http`, `server`;
    `v2Api` gives `v2`, `api`; `Été-Facture` gives `Été`/`Été` and `Facture`/`facture`.
  - **D-05 (revised; review #18).** `\p{L}`, `\p{Lu}` and `String.prototype.toLowerCase` depend on the Unicode
    tables of the runtime, so stems and module ids could differ between Node.js versions, against
    "byte-identical on every platform". Tokenization and case folding are therefore ASCII-only, and
    non-ASCII characters are kept as letters without case folding or camel-case splitting. Tokens never
    contain `#`, `~`, `%` or `/` (ASCII separators), so stems are always safe inside module keys. The cost is
    that `Été` and `été` give different stems; ALGORITHMS.md states it. The lint block of 2.1 bans `Intl`
    and the locale methods in inference, and the reviewer greps for `\p{`, `toLowerCase` and `toUpperCase`
    outside `asciiLower`.
- **`sStem(word)`** applies the rules to the lower-cased word in this order; the first rule that applies
  wins:

  | # | Word | Condition | Result |
  | --- | --- | --- | --- |
  | 1 | ends in `ies` | not `eies` or `aies`, length > 4 | `-ies` → `-y` |
  | 2 | ends in `sses`, `xes`, `shes` or `zzes` | | drop `es` |
  | 3 | ends in `es` | not `aes`, `ees` or `oes` | drop `s` |
  | 4 | ends in `s` | not `ss` or `us`, length > 3 | drop `s` |
  | 5 | otherwise | | unchanged |

  This is the prototype's `s_stem`, which the design describes. It is tested against the §9.1 table and
  against "pies" → "pie" (rule 1 does not apply, rule 3 does) and "services" → "service".
- **`nameParts(fileName)`** strips the last extension and splits the rest on `.`: `head` is the first part,
  `qualifiers` are the others, ASCII-lower-cased.
- **`fileStem(path, vocabulary)`.** Let `t` be the first token of the head and `key = sStem(t.key)`. The
  result is `undefined` when `key ∈ nonStemTokens` or `key.length < 2`; otherwise
  `{ stem: key, original: t.text }`.
  - **D-06:** only the first token of the head is considered, exactly as §1.4 states. `payment-gateway.ts`
    gives `payment`, `OrderService.ts` gives `order`, and `index.ts` and `dto.ts` give no stem. The original
    spelling travels with the stem, because §3.10 names modules by it.
- **`pluralize(word)`.**
  - a consonant followed by `y` → `ies`;
  - `s`, `x`, `z`, `ch`, `sh` → `+es`;
  - otherwise `+s`.

  It preserves the case of the input ("Payment" → "Payments").

#### 4.1.3 Vocabularies (§1.4, §4.2, §4.3): `vocabulary.ts` and `settings.ts` (U1)

The design writes "..." in two lists. The defaults below are exact; they are the union of the design's tables
and the prototype's lists (D-10).

| Vocabulary | Default entries |
| --- | --- |
| containers (exact lower-case match, D-07) | `app apps cmd domains feature features internal libs module modules packages pkg source sources src` |
| shared (stemmed) | `base common config configuration constant core helper interface kernel lib misc setting shared support tool type util utility` |
| directory → layer (stemmed key → layer) | `controller`→controller; `route router routing`→route; `handler`→handler; `resolver`→resolver; `middleware guard interceptor`→middleware; `view`→view; `page screen`→page; `component`→component; `presentation ui web http`→presentation; `api rest graphql endpoint`→api; `service`→service; `usecase use-case use_case interactor application`→application; `domain`→domain; `model entity`→model; `schema`→schema; `dto`→dto; `repository repo dao persistence`→repository; `db database`→database; `data`→data; `storage`→storage; `store`→store; `client`→client; `gateway`→gateway; `integration`→integration; `adapter`→adapter; `port`→port; `infrastructure infra`→infrastructure; `job worker task cron`→job; `hook`→hook; `listener subscriber consumer`→listener; `command cli`→command |
| naming suffix → role (stemmed) | `controller`→http-controller; `route router`→route-definition; `middleware guard interceptor`→middleware; `service`→service; `repository repo`→repository; `entity model`→data-model; `dto`→data-transfer-object; `client`→external-client; `module`→module-definition; `store`→state-store; `page`→ui-page; `component`→ui-component |
| role → layer | http-controller→controller, route-definition→route, middleware→middleware, service→service, repository→repository, data-model→model, data-transfer-object→dto, external-client→client, ui-page→page, ui-component→component, state-store→store; module-definition, configuration-provider, utility and every `x-` role → no layer (⊥) |
| generic tokens (stemmed; never a stem) | `abstract action adapter app base bootstrap client command common component config constant consumer container context controller core default dto effect entity enum error event exception factory filter fixture guard handler helper hook index init interceptor interface job listener log logger main mapper message middleware mock mod model module option page pipe provider query reducer repo repository request resolver response result route router saga schema selector server service setting setup shared slice spec store story style subscriber test type util validator view worker` |
| conventional tiers | 0: route, page · 1: controller, handler, resolver, view, api, presentation, middleware, job, listener, command · 2: component, service, application, hook, store · 3: domain, repository, gateway, client · 4: database, storage, data, model, dto, schema · no tier: infrastructure, adapter, port, integration |

- **D-07 (container matching).** Containers match on the exact lower-cased name, not the stemmed one. With
  stemming, `domains` (a container) would capture `domain` (a layer: clean-architecture's `src/domain` would
  be split into `model/` and `ports/`), and `libs` would capture `lib` (shared). The prototype also matches
  containers by raw name.
- **D-08 (kind precedence).** The precedence is container > layer > shared > feature.
  `directoryKind(name, vocabulary)` is total and deterministic. This matters once users add entries that
  overlap. Location votes use the same function (D-18).
- **D-09 (role tokens).** §1.4's "role tokens, the union of the vocabularies in 4.2" means the naming-suffix
  keys, which are always excluded from stems. They are not the directory-layer keys: `task`, `data`, `api` or
  `port` can name features (a todo app's `task.controller.ts`). The prototype's extra technical tokens
  (`mapper`, `factory`, `saga`, ...) join the configurable `generic_tokens` default.
- **D-10 (additions).** `utility` (shared), `use_case`, `consumer` and `cli` (layers) come from the
  prototype or plain stemming gaps (`utilities` stems to `utility`, not `util`). They are documented as
  defaults.
- **D-69 (normalization of configured names; review #37).** `settings.ts` normalizes every configured
  vocabulary name the way names are matched:
  - every name is ASCII-lower-cased (D-05);
  - entries of `shared_directories` and `generic_tokens`, and the keys of `directory_layers` and
    `naming_suffixes`, are then S-stemmed, because they are matched against stemmed names;
  - entries of `container_directories` are not stemmed (exact match, D-07);
  - a `!name` entry removes the default whose normalized form equals the normalized `name`, in the same list;
  - layer names of the vocabularies (values of `directory_layers` and `role_layers`, entries of
    `conventional_tiers`) are validated kebab-case and used as written, like the default layer names;
    declared layer names are the user's names, validated like declared module names (non-empty, no
    surrounding spaces; `layer:` ids allow any name) and used as written; role keys are roles.

  Two configured keys of one map that normalize to the same key (`Services` and `services`) are a
  validation error naming both (5.2), using the exported `normalizeVocabularyName`. Tests: case variants,
  plural variants (`helpers` removes `helper` via `!helpers`), containers not stemmed.
- **Merging rules** (`settings.ts`):
  - `container_directories`, `shared_directories` and `generic_tokens` add to the defaults, and an entry
    `!name` removes one;
  - `directory_layers`, `role_layers` and `naming_suffixes` merge over the defaults, and `null` removes an
    entry (for `role_layers`, `null` means "no layer");
  - `conventional_tiers` replaces the defaults;
  - `locationRoles` is the inverse of `roleLayers`, restricted to layers that exactly one role maps to.

#### 4.1.4 Directory helpers: `directories.ts` (U1)

- `DirectoryTree.fromPaths(paths)` is built in O(Σ path depth). It answers:
  - `children(dir)`: child directories with files in their subtree, sorted;
  - `directFiles(dir)`: indices into the input paths, ascending;
  - `subtreeSize(dir)`.
- `sourceRoot(scopeDirectory, paths)` descends from `scopeDirectory` while the directory has no direct file
  and exactly one child.
- **D-11.** Module inference computes its source root over the scope's nodes (§3.5). Roles and layers
  compute it over all `source` files of the scope (declared-module files included), so that declaring a
  module never changes another file's location vote.

### 4.2 Components (§2) [DERIVED]: `components.ts` (U2)

`inferComponents({ model, fileRoles, repositoryName })` takes these steps:

1. The owned files are the files whose role is in `fileRoles`. Build a `DirectoryTree` over their paths.
2. A directory `d` is a component when `subtreeSize(d) > 0` and at least one of these holds:
   - `d = ""`;
   - `d` has direct owned files;
   - `d` is a `PackageEntity.path`;
   - `children(d).length ≥ 2`.
3. Walk the tree depth-first in path order and keep a stack of the nearest component ancestor. That gives
   `parent` and `children` (sorted).
4. The remaining fields:
   - `kind`: `package` when a manifest is declared at `d`.
   - `name`:
     - the declared name of the package with the smallest id at `d`;
     - for unnamed manifests, whose `PackageEntity.name` equals the manifest directory path or `.` (D-12):
       the repository name at the root, otherwise the directory name;
     - the repository name at the root when there is no root manifest;
     - otherwise `relativePath(parent.path, d)`.
   - `packages`: the packages declared at `d`, else the nearest enclosing package, else `[]`.
   - `files`: direct owned files, sorted.
   - `totals`: one bottom-up pass summing `files`, `symbols.length` and `lines ?? 0`.

`modules` is filled in by `infer.ts` once modules exist. `dependencies` and `dependents` come from the
aggregation.

Cost: O(F · D) time, O(F + directories) memory.

- **D-12.** Unnamed manifests are handled as described in step 4.
- **D-13.** With several manifests in one directory (different ecosystems), `kind` is package, `name` comes
  from the smallest package id, and `packages` lists all of them.

### 4.3 Architectural roles and per-file layer labels (§4.2, label part of §4.3): `roles.ts` (U2)

`inferRoles({ model, settings, configured })` considers only files whose role is `source` (D-17). For each
such file `f`, in id order, it collects votes:

| Source | Vote | Confidence | RoleEntry written |
| --- | --- | --- | --- |
| configuration | each `ConfiguredRoleSpec` containing `f`: label `roleLayers(role) ?? ⊥` | 1.0 | `{role, source: "configuration"}`, signal `configured-glob` |
| detector | each existing `RoleEntry` whose source is not `naming`, `location` or `configuration` | its confidence | none (kept as is) |
| naming | the last qualifier `q` with `sStem(q) ∈ namingSuffixes` | 0.8, signal `name-qualifier` | `{role, source: "naming"}` |
| naming | the last token of the head when the head has ≥ 2 tokens (D-15) | 0.6, `name-suffix` | same entry |
| naming | the last token of each exported top-level class name of `f` (D-16) | 0.6, `type-name-suffix` | same entry |
| location | the outermost directory between the scope's source root and `f` whose `directoryKind` is `layer` (D-18) | 0.7, `directory-name` | `{role: locationRoles(layer), source: "location"}` only when such a role exists (D-18) |

**Scoring.**

- `RoleEntry.confidence` is the **maximum** of its signals (D-14). Each signal becomes an `Evidence` entry
  with `value` set to its confidence.
- Label scores combine sources by noisy-OR. With `c_σ(L)` the maximum confidence among source σ's votes for
  label L (each detector id counts as its own source), `s(L) = 1 − Π_σ (1 − c_σ(L))`.
- The winner is the label with the highest score; scores are compared after `roundMetric`, so that
  mathematically equal products computed in different orders tie (D-67). Ties go first to the label whose
  strongest vote has the higher precedence (configuration > detector > naming > location), then to ⊥
  (D-19), then to the smaller name.
- `FileLabel.label` is the winner when it is not ⊥ and its score is ≥ `minLabelScore`; otherwise null.

`withRoles(files, roles)` merges the entries. It keeps existing entries of other sources and replaces existing
`naming`, `location` and `configuration` entries (D-20), sorts by role then source, and copies only the files
that change.

Cost: O(F + Σ path depth + exported classes) time, O(F) memory.

- **D-14 (max within a source, noisy-OR across sources).** §4.3 says "noisy-OR over its votes". Taken
  literally, the file-name suffix and the class-name suffix of the same file would count as independent
  evidence (`SqlBookRepository` in `sql-book-repository.ts`). In clean-architecture the three SQL
  repositories would then score repository 1 − 0.4 · 0.4 = 0.84, above their location vote 0.7, and
  `infrastructure` would lose half its files to a new `repository` layer. That contradicts the fixture and the
  design's own result (§4.6, infrastructure has 6 files). The design's worked numbers (0.94 per controller,
  layer confidences 0.939, 0.925, 0.939, 0.862) are exactly "one vote per source", and the prototype had no
  class-name votes at all. Votes within a source are correlated observations of one naming convention, so
  they combine by maximum. The design's example "`UserService` raises service to 0.92" becomes 0.8, and the
  decision it illustrates (service wins) is unchanged. The linker-graph replay reproduces §4.6's layered and
  clean confidences exactly with this rule.
- **D-15.** A word suffix requires at least two tokens: `dto.ts` is not "a file ending in dto". Qualifiers and
  suffixes match after stemming (`orders.routes.ts` gives `route`). The last matching qualifier wins
  (`payment.controller.ts`).
- **D-16.** Type-name votes come from exported symbols of kind `class` with no `parent`, read through
  `model.index.symbolsOf(file)`. Documents with `detail.symbols = false` have no class-name votes, and the
  docs say so.
- **D-17.** Roles, configured roles included, are assigned to `source` files only. Architectural roles
  describe production code, and layers contain only source files. A configured glob that matches a test
  does not make it a controller.
- **D-18 (revised).** A location vote comes from the outermost directory below the source root whose
  `directoryKind` is `layer`, so the kind precedence of D-08 applies: a container such as `domains/` (which
  stems to the layer key `domain`) never votes, and in `src/domains/orders/controllers/x.ts` the vote comes
  from `controllers`. The prototype matched stemmed names only, so it would have put every file under a
  `domains/` container into a `domain` layer; no fixture has such a directory. A location vote produces a
  `RoleEntry` only when exactly one role maps to its layer (inverse of `roleLayers`). Directories such as
  `domain`, `application` and `infrastructure` give layer votes only. Because container entries change
  location votes, the layer method covers `container_directories` (D-56).
- **D-19.** On an exact tie, ⊥ wins over a named label. This is conservative: no layer rather than a guess.
- **D-20 (idempotence).** Existing `naming`, `location` and `configuration` entries are replaced and never
  read as votes. Running inference on its own output therefore gives the same roles. The same holds for
  existing components, modules and layers in the input model, which inference ignores.

Role evidence descriptions name the rule and the vocabulary entry (D-66), for example "Naming rule (Katedrala
heuristic): the file name `payment.controller.ts` has the qualifier `controller`, which the naming vocabulary
maps to `http-controller`."

### 4.4 Modules (§3)

#### P0: scopes and nodes (§3.4): `modules/scopes.ts` (U4)

1. Resolve declared modules first (see Declared below).
2. The nodes are files with role in `settings.modules.fileRoles` that no declared module owns. The graph is
   `buildWeightedFileGraph(model, { ...weighting, edgeKinds: projection.edgeKinds, fileRoles, exclude:
   declaredFiles })`.
3. Partition the nodes by scope: `FileEntity.package ?? ""`, processed in id order ("" first). Each scope
   gets `{ id, directory: package path or "", packageName, graph: restrictWeightedGraph(...) }`.
4. Skip inference entirely when `!modules.enabled`, or when `whenDeclared = "none"` and at least one module is
   declared. With `none` and no declared module, all modules are inferred.

Cost: O(n + m).

- **D-21.** `when_declared: none` only applies when something is declared; `enabled: false` disables
  inferred modules even then. Declared modules are always produced.

#### Declared modules (§3.14, §6.2): `modules/declared.ts` (U4)

1. Members are the files of `spec.files` whose role is in `settings.componentFileRoles` (D-22), so code,
   tests and declarations, not `package.json` or READMEs. Specs arrive sorted by name; a file matched by
   several declared modules belongs to the one whose name sorts first (D-23).
2. Overlaps are reported as `configuration-warning`s (D-24), one per pair of the module that keeps the
   files and a module that loses them: the message starts with "Files match several declared modules",
   names both modules and the rule ("the first by name keeps them"), and gives the number of files and the
   first paths, at most `limits.maxEvidenceEntities`, so a broad glob cannot flood the diagnostics. Its
   `file` is the configuration file when it is a snapshot file; it has no line, so key order never shows in
   the document (D-23). Declared layers report overlaps the same way, by list order (D-50).
3. The id is `mod:<name>`; `origin` is `declared`; there is no `anchor` and no `inference`.
4. A declared module that matches nothing is kept (rules may name it) with `files: []` and a
   `configuration-warning`.

Cost: O(Σ spec sizes).

- **D-22.** Declared membership is "exact glob membership" restricted to owned code roles. A module groups
  code, not documentation. The docs say so.
- **D-23 (revised; review #6).** Overlaps resolve by module name (`compareStrings`), not by property order.
  `configuration.canonicalJson` sorts keys, and `analysisDigest` hashes it. With an explicit `configPath`, or
  a configuration file excluded by `exclude`, the file's bytes are in no digest. Reordering two overlapping
  modules would then give equal content and analysis digests but different documents, against IR.md
  ("documents with equal content and analysis digests are identical"). The design's "first in configuration
  order" is therefore replaced by "first by name". Configuration key order then never carries meaning: a
  formatter that sorts YAML keys changes nothing, and no integer-like-key edge case of JavaScript object order
  remains. Overlaps are warnings that users resolve, so the less familiar rule costs little; the warning
  states the rule. Q-13 records the alternative, which would hash the declaration order into
  `analysisDigest` and reject integer-like module names. Engine test (U5): reordering two overlapping modules
  in an explicit configuration file gives byte-identical documents and equal digests.
- **D-24.** The overlap warnings use the existing `configuration-warning` code, not new `module-overlap` and
  `layer-overlap` codes, so the IR's `DiagnosticCode` enumeration stays unchanged. Section 9, Q-5 covers
  this.

#### P1: prior units (§3.5): `modules/prior.ts` (U3)

1. Build a `DirectoryTree` over the scope's node paths and compute `r = sourceRoot(scope.directory, paths)`.
2. `descend(d)` decides whether `d` is split. It is split when `d = r`, or `directoryKind(d) = container`,
   or `subtreeSize(d) > maxModuleFiles` while `d` has a child with nodes.
   - Not split: one directory unit with the whole subtree. Its kind is `directoryKind(d)` (feature, layer
     or shared), its key `d`, and it is a destination only when its kind is feature.
   - Split: if `d` has direct nodes, they form a unit keyed `d`. Its kind is `root` when `d = r`, `shared`
     when `d` is a container, and otherwise `directoryKind(d)` (D-25). Then descend into `children(d)` in
     path order.
3. Every unit records `prior = members`.

Data: a mutable `Partition { units: Unit[]; unitOf: Int32Array }`, internal to U3.

Cost: O(n · D).

- **D-25.** §3.5 calls the loose files of every split directory other than `r` a "shared unit (loose files of
  a container)". A feature directory split only by the size cap would then turn its own loose files into a
  pinned shared unit. The plan applies "shared" to containers only; otherwise the loose files keep the
  directory's own kind.

#### P2: organization style and stem units (§3.6): `modules/stems.ts` (U3)

For every split directory `d`, in path order:

1. Classify the children with nodes into layer (`L`), feature (`F`) and shared (`S`) children. Container
   children are counted in none of them (D-26).
2. If `|L| ≥ 2`, give each node below a layer child `c` a stem:
   - The *sub-directory stem* (D-28): if the node lies in `c/s/...`, `sStem(asciiLower(s))` is not a generic
     token, and `s` occurs directly below at least two layer children, the stem is that stemmed name.
   - Otherwise the stem is `fileStem(path)`.
3. Run union-find over the scope graph's edges whose endpoints share a stem and both lie below layer
   children (the undirected view).
4. Keep, per stem, the union of the components that span at least two layer children (D-27). Then compute
   `coverage = kept / below`, the correctly rounded quotient of the kept nodes and the nodes below layer
   children (D-67). The denominator includes nodes in sub-units of a size-split layer child.
5. If at least one stem was kept and `coverage ≥ stemMinCoverage`, apply the stems in stem order. A stem's
   files leave their units (both `members` and `prior`). They join the feature child of `d` whose stemmed
   name equals the stem, the one with the smallest path when several do (D-70); otherwise a new unit
   `{ key: d#stem, anchor: { directory: d, stem }, kind: "stem", destination: true, group: d }` is created.
6. The style is:
   - `layer` when `|L| ≥ 2`, or `mixed` when also `|F| ≥ 1`;
   - `feature` when `|L| ≤ 1` and `|F| ≥ 1`;
   - `none` otherwise (D-26).

   `GroupOrganization` records the counts.

Cost: O(n + m) per scope, plus tokenization O(Σ name lengths).

- **D-26.** The style table of §3.6 is not total: it has no row for one layer child and no feature child,
  which is the case of simple-dependencies (`src/services`, `src/utils`). The plan adds style `none` (no
  stems, directory units stay). Container children are excluded from the counts, whereas the prototype
  counted `features/` as a feature child.
- **D-27 (revised; review #7).** §3.9 says "stem units are connected by construction", but P2 keeps the
  *union* of qualifying components. The plan keeps the union, which is what the design's table specifies.
  ALGORITHMS.md states the precise guarantee: every kept component is connected and spans at least two
  layer directories, and weak cohesion of a union shows in `internal-edge-ratio`. Revision 1 illustrated
  this with express-app, but on the linker graph both express stem groups are connected (`calls` edges
  from the controllers to the services, resolved through `container.ts`). The illustration is therefore a
  synthetic U3 test: stem `order` with two components, each spanning two layer children, gives one stem
  unit with both.
- **D-28 (sub-directory stems).** Only the first sub-directory level directly below a layer child counts
  (`controllers/payment/x.ts` and `services/payment/y.ts` give `payment`), and the occurrence test counts
  distinct layer children, as the prototype does. Deeper levels are a feature's internal structure.
- **D-70 (feature-child tie-break; review #37).** When two feature children stem to the same stem
  (`order/` and `orders/`), the stem's files join the child with the smallest path. Tested.

#### P3: structural classes (§3.7): `modules/classes.ts` (U3)

1. **First-pass utilities.** Count the distinct prior units of each file's in-neighbours other than
   `prior(f)`, with a per-file marker array, in O(n + m). A file is a utility at `≥ utilityMinModules`, or at
   `≥ 2` when `prior(f)` is shared or root. That second threshold is a fixed constant.
2. **Orchestrators**, as a monotone worklist fixpoint (D-30):
   - Precompute `shape[f]`, the orchestrator conditions (ii)–(iv), from `f`'s out-weights to units,
     ignoring first-pass utilities: at least 2 other units, no unit above 50 %, its own unit at most 25 %
     (compared on exact sums, D-67).
   - Maintain `outside[f]`, the number of non-orchestrator dependents outside `prior(f)`, and
     `remaining[f]`, the number of non-orchestrator dependents.
   - `f` becomes an orchestrator when it is not a first-pass utility and either `f ∈ entryPoints` with
     `remaining[f] = 0` (entry-point rule), or `shape[f]` holds with `outside[f] = 0` (shape rule).
     `orchestratorRule[f]` records which rule fired first, and `dependencyUnits[f]` the number of other
     units its dependencies reach (D-66).
   - When `f` is added, decrement the counters of its targets and enqueue them.
3. **Final utilities.** Recount as in step 1 with orchestrators ignored as dependents; orchestrators are never
   utilities. `dependentUnits[f]` records the count (D-66).
4. **Facades.** `f` is a facade when `reexportOutDegree[f] · 2 ≥ admittedOutDegree[f] > 0`.
5. **Pinned files** (an internal mask) are orchestrators, utilities, facades and members of units whose prior
   kind is shared.

Cost: O(n + m).

- **D-29.** "Dependents" and "dependencies" are in-scope neighbours with weight > 0.
- **D-30.** The prototype repeats id-order passes until nothing changes. Orchestrator status only grows, and
  every condition only becomes easier as it grows, so the least fixpoint is unique. The worklist computes the
  same set in O(n + m) instead of O(n · (n + m)) in the worst case. A property test checks equality against
  the naive passes (`reference.test-support.ts`).
- **D-31.** A "declared entry point" is a file that is the entity of an `EntryPointEntry` of any kind, or
  whose symbol is. The 50 % and 25 % thresholds of the orchestrator conditions and the shared/root utility
  threshold 2 are constants, as in §6.3, and are documented.

On the linker graph these classes are broader than the design's prototype output (7.3), which is why their
wording matters (D-66). Examples: tangled-architecture has 7 utilities, not 3. The package barrels
`src/index.ts` of typescript-features and circular-dependencies are declared entry points and facades, and
the entry-point rule makes them composition roots. Express's DI container `src/container.ts` is a utility.

#### P4: oversized units (§3.8): `modules/split.ts` (U3)

P4 applies to directory, root and shared units with more than `maxModuleFiles` nodes after P2. Stem units
are not split (D-32). Within one such unit the prior nodes lie directly in one directory (P1 split every
oversized directory that has children with nodes); only stem files that P2 added to a feature child lie
elsewhere. File names can therefore repeat only in that case, and the hash fallback of D-34 keeps keys
unique.

1. `const { graph: sub, mapping } = scopeGraph.inducedSubgraph(unitNodes − orchestrators − utilities)`
   (review #16). `sub.toUndirected()` gives `G_U`, with `w̄(u, v) = w(u → v) + w(v → u)`.
2. Run `louvain(G_U, { ...LOUVAIN_OPTIONS, initialCommunities })` and map the communities back through
   `mapping`. Initial labels are stem labels numbered by first occurrence in node order; stemless nodes get
   singletons. `louvain`'s final refinement makes communities connected. `LOUVAIN_OPTIONS` pins every
   parameter (D-68).
3. Merge small pieces by iterated simultaneous best-neighbour merging (D-33). Every piece with fewer than
   `minModuleFiles` nodes and at least one edge to another piece points to the piece it shares the most
   weight with (exact sums; ties: the smaller piece index, which is the smallest member). Each connected
   component of that pointer graph merges into one piece. Repeat until no small piece has an edge to another
   piece. Each round at least halves the number of small pieces that have edges, so there are O(log p)
   rounds.
4. Assign keys (D-34). Visit pieces by decreasing size, then smallest member. Each piece takes its most
   frequent stem (ties: lexicographically smallest) that is not yet taken. The taken set starts with P2's
   stems of the same directory.
5. A piece becomes `{ key: dir#stem, kind: "split", destination: true, oversized }`. The remainder keeps the
   original unit's key, kind and destination flag (D-32). It consists of the removed orchestrators and
   utilities and of small pieces without edges to other pieces, and gets `oversized` too.

Cost: O(m_U log m_U) per Louvain pass, plus O(m_U log p) for merging.

- **D-32 (which units are split, remainder).** The rules are those of this section.
- **D-33 (merge order).** §3.8 does not say how cascades of small pieces resolve. The rule above is
  order-independent and terminates.
- **D-34 (revised: keys; review #19).** Key dedupe includes P2 stems. A piece without an available stem takes
  the fallback `fileNameKey(smallest member)`: the `key`s of the tokens of its file name, extension included,
  joined by `-` (`formatDate.ts` gives `format-date-ts`). Fallbacks contain `-` and stems do not, so a
  fallback never collides with a stem. When the fallback is taken as well (`format_date.ts` next to
  `formatDate.ts`), the key is `shortHash(path of the smallest member)`, 16 hex digits. Keys are content-derived
  and never a counter, as ADR-004 requires; revision 1's `-2`, `-3` suffixes depended on processing order.
  The `ModuleAnchor.stem` TSDoc allows both forms (3.5).
- **D-68 (pinned Louvain parameters; review #36).** `LOUVAIN_OPTIONS = { resolution: 1, maxLevels:
  Number.POSITIVE_INFINITY, maxPasses: 1000, minModularityGain: 1e-12, minPassGain: 1e-7 }` copies today's
  defaults of `@katedrala/graph.louvain` into an inference constant. A later change of the graph package's
  defaults then cannot change module ids without a method version bump (R-7). ALGORITHMS.md lists the
  values; a test asserts that `split.ts` passes all five.

#### P5: strict-majority reassignment (§3.9): `modules/reassign.ts` (U3)

- **Data structures** (all typed arrays):
  - `unitOf`;
  - `unitSize` (nodes per unit);
  - sparse accumulators `inW` and `outW` (Float64Array of size U) with a touched list;
  - a `support` Int32Array;
  - `keyRank`, the rank of each unit key in compareStrings order, so ties compare as integers.
- **A pass** visits nodes in ascending order and skips pinned nodes.
  1. Accumulate in- and out-weights per unit from the CSR rows (evidence: orchestrators' and utilities'
     edges are skipped).
  2. `C` is the unit with the largest `inW`; ties go to the smallest key rank.
  3. Move `f` from `P` to `C` when all five conditions of §3.9 hold:
     - `C ≠ P` and `C.destination`;
     - `inW[C] > 0.5 · Σ inW`;
     - `inW[C] ≥ moveMinWeight`;
     - `support[C] ≥ (unitSize[P] ≥ 2 ? moveMinSupport : 1)`;
     - `Σ outW = 0` or `outW[C] > 0.5 · Σ outW`.
  4. Assignments update immediately, and each move records its maps (D-36).
- **Termination.** Passes repeat until one moves nothing, up to `maxPasses`. `converged` is false when the
  limit stopped the process (D-37).

Cost: O(passes · (n + m)) time, O(n + U) memory.

- **D-35 (destinations).** Feature, stem and split units, and feature-kind P4 remainders, are destinations.
  Files whose prior kind is shared are pinned, so a shared directory is never emptied by P5.
- **D-36 (relocation records).** A relocation is reported only when a file's final unit differs from its
  prior unit. Its `dependents` and `dependencies` maps are those of the file's last move. A file that moved
  away and back reports nothing.
- **D-37 (non-convergence).** When P5 stops at `maxPasses` with moves pending, an `info` diagnostic
  `limit-reached` names the scope ("module reassignment stopped after 50 passes; memberships may depend on
  the pass limit"). Determinism is unaffected.
- **D-74 (condition 4 uses the current unit size).** The lone-file exception of condition 4 uses the unit's
  current size, as §3.9's pseudo-code (`p.nodeCount`) and the prototype do. The design's rationale, "a lone
  file cannot be held by its own unit", applies to any file left alone. Two consequences on the linker graph
  differ from the design's summaries (7.3):
  - Singleton prior units are absorbed by the destination they serve. Express `clients/stripe.client.ts`
    joins `mod:src#order`. In fastify, `clients/shipping.client.ts` and `services/pricing.ts` join
    `mod:src#order` and `hooks/auth.ts` joins `mod:src/plugins`. High-fan-in `services/payment.service.ts`
    joins `mod:src#order`.
  - Cascades: in monorepo `@acme/core`, `catalog/product.ts` moves to `orders` (2 of its 3 dependents are
    there; one of them is a `uses` edge the prototype graph lacked). `catalog/catalog.ts` is then alone and
    follows (1 of 1), and the `catalog` module disappears.

  Every move is a strict majority and is reported as `relocated-files` evidence. The replay also ran the
  alternative, "only singleton *prior* units": it keeps a one-file `catalog` module with confidence 0.15
  and a `catalog ↔ orders` cycle, which explains less (`replay.prior.out.txt`). The plan keeps the design;
  Q-11 asks for sign-off, and a synthetic U3 test pins the cascade.

#### P6: identity (§3.10): `modules/identity.ts` (U3)

1. Drop empty units. Keys come from `inferredModuleKey(anchor)`, which gives `.` and `.#stem` at the root and
   escapes the directory part (3.5).
2. Names:
   - **Directory, layer and shared units:** the last segment of the anchor directory.
   - **Root unit:** the scope package's declared name without its npm scope. For an unnamed manifest: the
     last segment of `r`, or the repository name at the root. Without a scope package: the repository name.
     When `r` is neither a container nor the package directory: the last segment of `r` (D-38).
   - **Stem unit:** the entity rule (D-39). If a member's `FileLabel.label ∈ {model, domain}` or it has a
     `data-model` role entry, and its head is a single token `t` with `sStem(t.key) = stem`, the name is
     `pluralize(t.text)` when `t.key = stem`, else `t.text` (an already plural head). Otherwise the name is
     the most frequent original first token among members (ties: compareStrings).
   - **Split piece:** the most frequent original spelling of its stem among its members; for a fallback key,
     the smallest member's file name without its extension.
3. Appending `~inferred` on a collision with a declared name happens in U4, which knows the declared names.

Cost: O(n).

- **D-38.** The root names are those listed in step 2, unnamed manifests included.
- **D-39.** Labels come from the roles stage before layer pruning, so module names do not depend on the
  global layer count. The case of the original token is kept, as §3.10 asks.

#### P7: tests and declarations (§3.11): `modules/attach.ts` (U4)

1. Build the attachment graph with `buildWeightedFileGraph(model, { fileRoles: nodeRoles ∪ {test,
   declaration}, edgeKinds, weighting })`. Edges weighted 0 are ignored.
2. For each test (when `attachTests`) and each declaration (when `attachDeclarations`) that is neither a node
   (when `file_roles` includes its role) nor a declared member, in id order (D-65):
   1. The candidates are the distinct files it depends on (a test) or that depend on it (a declaration)
      that are members of *any* module: declared or inferred, of any scope, attached files excluded.
   2. If one module holds a strict majority of the candidates, attach the file to it when it is an inferred
      module of the file's own scope. Otherwise leave the file unassigned, with no location fallback.
   3. If no module holds a majority, fall back on location (D-42) only when the file's role is outside the
      metrics projection: tests, unless `settings.modules.testsInMetrics`
      (`analysis.include_tests_in_metrics`). Declarations are always in the metrics projection
      (`DEFAULT_FILE_ROLES`). Otherwise leave the file unassigned.
   4. Location: the inferred module of the file's scope with the most nodes *directly* in the file's
      directory (ties: smallest id), then likewise for each ancestor up to the scope directory; else
      unassigned.
3. Every module with attached files gets an `attached-files` context signal (D-64).

Cost: O(F_attached · D + m_attached).

- **D-40 (superseded by D-65).** Revision 1 counted only candidates in inferred modules of the same scope, so
  a test of four declared files and one inferred file was attached by a 1-of-1 "majority" (review #21).
- **D-41.** The attachment graph is a separate projection (memoized) with the same weighting and
  confidence filter as the inference graph.
- **D-42.** The location fallback counts nodes directly in a directory, not in its subtree. Otherwise a big
  module elsewhere in the subtree would win ("location" means where the file is).
- **D-65 (attachment policy; reviews #3 and #21).**
  - **Candidates over all modules.** The majority is computed over every module, so a test mostly of
    declared code stays out of inferred modules. Declared membership is exact (§3.14), and inferred modules
    never span packages, attached files included.
  - **Files whose role the metrics projection includes are attached by strict majority only.**
    `aggregateDependencies` runs on the metrics projection, whose file roles include `declaration` (and
    `test` with `include_tests_in_metrics`). An attached file of such a role therefore creates module
    dependencies; the design's "attaching changes no metric" holds only for tests outside the projection.
    A strict majority keeps most of the attached file's edges inside its module; a location guess would
    invent dependencies:
    - typescript-features `src/globals.d.ts` has one dependent in the root module (`shop.ts`) and one in `ui`
      (`ui/OrderList.tsx`). By location it would join the root module, and OrderList's `uses` edge would
      become a `mod:src/ui → mod:src` dependency. Now it stays unassigned.
    - express-app `src/types/express.d.ts` has no dependent at all, so it stays unassigned instead of
      joining the root module with an edge to `models/user.ts`.
  - ALGORITHMS.md and IR.md state that attached declarations (and tests counted in metrics) take part in
    module dependencies.
  - Tests: majority to a declared module → unassigned; majority to another scope → unassigned; declaration
    without majority → unassigned; test without majority → location; `include_tests_in_metrics` → tests by
    majority only; nodes skipped. U5 fixture test: `globals.d.ts` unassigned and no
    `mod:src/ui → mod:src` dependency.

#### P8: entry points, public API, packages (§3.12): `modules/surface.ts` (U4)

- **Entry points.**
  - Inferred modules: members named `index.*` directly in the anchor directory, plus facades directly in
    it.
  - Declared modules: `spec.entry ∩ members`. When `entry` is not configured, the same rule as inferred
    modules applies in `commonDirectory(members)` (D-43).
- **`publicApi`** (D-63): the module's members (for inferred modules, node members only: attached files are
  never listed) that are the target of an `imports` or `re-exports` IR edge whose source file is a member
  (node or attached) of a different module. The edge must be admitted by the metrics projection: its
  type-only setting and file roles. Both kinds are always among its edge kinds.
  It is computed on `model.projection({ level: "file", edgeKinds: {imports, re-exports}, includeTypeOnly:
  projection.includeTypeOnly, fileRoles: projection.fileRoles })`, memoized.
- **`packages`.** The packages of all member files, attached files included.

Cost: O(n + m_imports).

- **D-43.** §3.12 says declared modules without `entry` behave "as for inferred modules", but declared
  modules have no anchor. The plan uses the members' common directory.
- **D-44 (superseded by D-63).**
- **D-63 (public API = imports and re-exports; review #1).** §3.12 defines `publicApi` over any
  metrics-projection edge, but the normative IR TSDoc says "member files that files of other modules import
  or re-export from". The linker lifts `calls`, `references-type` and `implements` references through
  barrels and declared types to the *declaring* file. clean-architecture's `src/domain/ports/
  member-repository.ts` is reached only through `src/domain/index.ts` and declared types, with no import. The
  design's rule would still list it as public, and M7's boundary-bypass could no longer tell barrel use from
  deep imports. The plan implements the IR's definition, which is a deviation from §3.12's text and no IR
  change. Sources in no module do not count, and attached files are never listed. U4 test on
  `prototypeModel("clean-architecture")` and U5 fixture test: `mod:src/domain`'s `publicApi` contains
  `index.ts` and not `ports/member-repository.ts`. The replay gives `index.ts` (imported by the application
  files) plus the eight domain files that infrastructure and presentation files import directly. That is
  real deep-import usage, which M7 compares with `entryPoints`.

#### P9: confidence and evidence (§3.13): `modules/confidence.ts` and `modules/explain.ts` (U4)

All signals are computed per scope in one pass over the evidence graph: the scope graph with the edges of
orchestrators and utilities skipped.

| Signal | Kinds | Computation |
| --- | --- | --- |
| `internal-edge-ratio` | feature, stem, split, layer | `2·W_in / (2·W_in + W_cut)`, both accumulated per unit in one edge pass |
| `membership-margin` | feature, stem, split | per member: shares over dependents grouped by unit, or over dependencies when it has no dependents; `max(0, own − best other)`; mean over members with evidence |
| `prior-agreement` | all | `\|members ∩ prior\| / \|members ∪ prior\|` (sorted-array merge) |
| `module-size` | all | `n / (n + 2)`, where n counts node members only |
| `shared-usage` | shared | dependents grouped by unit, with orchestrators ignored but utilities kept (D-46) |
| `wiring-share` | root | `\|members ∩ (orchestrators ∪ facades ∪ entry points)\| / n` (review #10) |

The weights follow §3.13: feature, stem and split 0.40/0.25/0.20/0.15; layer 0.50/0.30/0.20; shared
0.50/0.30/0.20; root 0.30/0.50/0.20. The context signals are listed in 4.6.

`wiring-share` counts each member once. Revision 1 summed the three classes and counted layered-architecture's
`src/main.ts` twice (orchestrator and entry point), which gave 2.0 and a confidence of 1.167, above the
schema maximum, instead of 0.867.

Cost: O(n + m) per scope.

- **D-45 (absent signals are still listed).** A weighted signal that cannot be computed is still listed,
  with its `weight` and no `value`, and contributes 0, as §3.13 requires. Its description says why ("No
  member file has dependency evidence ..."). Σ weights = 1 stays visible in every module, and each kind
  keeps a fixed set of weighted signals.
- **D-46.** `shared-usage` and `single-user-files` measure how utilities are used, so they run on the scope
  graph with only orchestrators removed. This is the prototype's computation and reproduces §3.16's 0.80 for
  layered-architecture's `shared`. Removing utilities would make it 0.
- **D-47.** "Contested" members are members whose margin is 0: their own weight does not exceed the best
  other weight, compared on exact sums (D-67).

### 4.5 Layers (§4.3–§4.5): `layers/*.ts` (U2)

**Membership** (`partition.ts`).

- **Declared layers (D-50).** When `declarations.layers` is present, each layer's members are `source` files
  matched by its globs, first layer in list order wins, with a `configuration-warning` for overlaps. Ranks
  come from the configuration. A declared layer matching no source file is kept with `files: []` and a
  `configuration-warning`, as for modules (D-71). There is no `inference`, and no layer is inferred.
- **Inferred layers.** Members are the files with `FileLabel.label = L`. A label is kept when it has at least
  `minLayerFiles` members, or one member with a location, configuration or detector vote for `L`. With fewer
  than two kept labels, `layers = []`.

**Layer graph** (`order.ts`).

- Nodes are the kept layers sorted by name.
- `w(A, B)` sums, over distinct file pairs u ∈ A, v ∈ B with A ≠ B, the edge weights of the weighted source
  graph (`fileRoles = {source}`, the edge kinds of the metrics projection, no exclusion, the same weighting
  as modules, D-51). Declared-module files are included, because layers are orthogonal to modules.
- `wType(A, B)` sums the type-only pairs' share of that weight, for the evidence descriptions (D-51).

**Ordering.**

1. Compute `stronglyConnectedComponents(H)`.
2. For each non-trivial SCC with `k ≤ exactOrderMaxLayers`, run the exact DP with the lexicographic
   tie-break of D-52.
3. For larger SCCs, use `greedyFeedbackArcSet` on the induced SCC subgraph (unweighted, an approximation the
   docs state).
4. The removed arcs are the upward dependencies.

**Conventional arcs (D-53).**

- Pairs `(A, B)` are processed by `(tier(A), tier(B), A, B)` with `tier(A) < tier(B)` and a shared package.
  A package is shared when it contains members of both layers; files without a package belong to the
  package `""` (review #22).
- An arc `A → B` of weight 0 is added when neither layer reaches the other in the current graph, observed
  arcs included, kept or added. Reachability is checked with a BFS per pair over the small H.
- Cost: O(L² · (L + E_H)).

**Ranks.** `rank = longestPathLengths(D, "in")`, where `D` is H minus the removed arcs plus the conventional
arcs.

**Confidence** (`explain.ts`), weights 0.35, 0.35, 0.20 and 0.10:

| Signal | Computation |
| --- | --- |
| `label-agreement` | mean winning score of the members |
| `direction-consistency` | share of incident cross-layer weight going out to a higher rank or coming in from a lower rank; equal ranks and removed arcs do not follow |
| `order-support` | share of other layers comparable through observed, non-removed paths (BFS over L) |
| `layer-size` | `n / (n + 2)` |

Absent signals contribute 0, as §4.5 states (D-54). The prototype renormalized; no fixture example differs,
because all of their layers have every signal.

Cost: O(F + m + 2^k k² + L³).

- **D-50 (revised).** Declared layer members are `source` files only, consistent with inferred layers. Rules
  such as layer-order would otherwise treat tests as layer members. Glob lists need a positive pattern
  (D-71).
- **D-51 (revised; review #38).** The layer graph uses the inference weighting and the `min_edge_confidence`
  filter; §4.4 gives 1.0 and 0.5 without a confidence filter. One weighting means one definition of
  evidence. `type_only_weight` and `min_edge_confidence` therefore enter both method strings when they are
  not defaults (D-56). Type-only references count at `type_only_weight` also when `analysis.include_type_only`
  is false. Layer *order* is inferred from evidence, like module membership (D-02), while
  `LayerEntity.dependencies` follow the metrics projection, which then omits type-only edges. Evidence
  descriptions therefore state the type-only share ("2 file dependencies (weight 1.5, of which 0.5
  type-only) point from `repository` to `service`, against the inferred order"). ALGORITHMS.md states that
  layer ordering always counts type-only references at `type_only_weight`.
- **D-52 (revised: exact order DP; review #23).** Number the SCC's layers 0..k−1 in name order. For a bitmask
  S of layers still to place after its complement P, `best(S) = min over a ∈ S of cost(a, P) + best(S \ {a})`,
  where
  - `cost(a, P) = (Σ_{b ∈ P} W[a][b], #{b ∈ P : tier(a) and tier(b) are defined and tier(b) > tier(a)})`:
    arcs from `a` back to already placed layers count as backward, and an inversion counts only when both
    layers have a conventional tier (the prototype's rule). Layers without a tier (infrastructure, adapter,
    port, integration) never count as inversions;
  - pairs compare lexicographically. W sums are exact (D-67), so mathematical ties are ties.

  The sequence is reconstructed from the full set, taking at each step the smallest `a` that attains the
  optimum, which yields the lexicographically smallest optimal sequence. Complexity O(2^k · k²), about
  600 000 steps for k = 12. This is the subset dynamic programme for vertex-ordering problems [ESTABLISHED]
  (Bodlaender, Fomin, Koster, Kratsch & Thilikos 2012, "A note on exact algorithms for vertex ordering
  problems on graphs", Theory of Computing Systems 50(3):420–432; review #29). A property test compares it
  with brute force over permutations for k ≤ 7, with weights from the 1/1024 lattice and random tiers,
  some absent.
- **D-53 (revised).** The processing order is the design's `(tier(A), tier(B), A, B)`; the prototype used
  `(A, B)`. Reachability is checked on the graph as it grows, so the result depends on the order. The
  design's order is the specification. Files without a package share the package `""`, so repositories
  without manifests get conventional arcs. Tested with a manifest-less synthetic repository.
- **D-54.** Absent layer signals contribute 0, as stated under Confidence.
- **D-55 (monorepos).** In the monorepo fixture, `handlers/` (in @acme/api) and `components/` (in @acme/web)
  give two layers with no arc and no shared package. Both get rank 0 and confidence about 0.30 (replay:
  0.295). The plan keeps the design (honest, low confidence). Q-4 asks whether to require an observed
  cross-layer dependency.
- **D-71 (glob lists and empty matches; review #20).** Core's glob lists treat `!pattern` as a list-wide
  exclusion, and "a list with only negated patterns matches every path not excluded". For `exclude` that is
  right; for membership it is not: `payments: ["!src/legacy/**"]` would claim the whole repository. Module,
  layer and role glob lists therefore need at least one pattern that is not an exclusion (5.2). Declared
  layers that match nothing get a `configuration-warning` like empty declared modules.

### 4.6 Evidence, reasons and explanation formats (§5): `evidence.ts` (U1), `modules/explain.ts` (U4), `layers/explain.ts` (U2)

**`inferenceInfo(input)`** (U1):

- It computes `confidence = Σ weight · (value ?? 0)` from unrounded values, then rounds every `value`,
  `weight` and the confidence with `roundMetric`.
- It orders the evidence totally (review #34): weighted signals by decreasing `weight · value` (absent value =
  0), then by `signal`; then context signals by `signal`, then `description`, then `value` (absent first),
  then `entities` compared element-wise. The `InferenceInfo.evidence` TSDoc and IR.md's ordering table state
  this order (3.5, 8.2).
- It sorts each `entities` list and truncates it to `maxEntities`.
- It does not check that weights sum to 1. The tests of U1, U2 and U4 assert Σ weights = 1 for every kind,
  and the U5 property checks it on random documents.

Decisions:

- **D-56 (revised: method strings; reviews #5 and #11).** The base method is `katedrala/module-inference@1` or
  `katedrala/layer-inference@1`. Every parameter that can change the stage's ids, memberships, ranks or
  confidences is appended when its effective value differs from the default, as `?k=v&k=v`, keys sorted by
  `compareStrings`:
  - keys of the method's own section are written bare (`max_module_files=200`), as in the design's example;
    keys of other `inference` sections carry their path relative to `inference`
    (`layers.directory_layers`, `modules.type_only_weight`, `roles`); the one core setting carries its
    full path (`analysis.include_tests_in_metrics`);
  - scalars are written with `String(v)`;
  - lists and maps are written as `h:` plus the first 8 hex digits of
    `sha256Hex(canonicalJson(effective value))`. The effective value is converted first: sets to sorted
    arrays, maps to objects. `ReadonlySet` and `ReadonlyMap` would otherwise serialize as `{}`, and every
    vocabulary would hash the same. `canonicalJson` (3.6) and `sha256Hex` (already there, pure JavaScript
    over `TextEncoder`) come from `@katedrala/ir`, so the lint block of 2.1 holds. Equal effective
    vocabularies give equal strings however they were written.
  - The **module method** covers `inference.modules.*`, plus `layers.directory_layers`,
    `layers.naming_suffixes`, `components.file_roles` and `analysis.include_tests_in_metrics`. Directory
    kinds (P1, P2, P5 destinations) depend on the layer keys, file stems exclude the naming-suffix keys
    (D-09), `components.file_roles` filters declared membership (D-22), which decides which files are nodes,
    and `include_tests_in_metrics` decides whether tests without a majority are attached by location
    (D-65). Without them a changed configuration would change module ids or memberships under an unchanged
    method, and M10 diff would compare incomparable inferences.
  - Declarations (`modules`, `layers`) are inputs, not parameters: they appear in the document as declared
    modules and layers, which diff compares directly. `analysis.include_type_only` changes only `publicApi`
    (D-63) and aggregated dependencies, which are derived from the metrics projection that M6 records in
    `metrics.projection`, so it enters no method.
  - The **layer method** covers `inference.layers.*`, `roles`, `modules.type_only_weight`,
    `modules.min_edge_confidence` (D-51) and `modules.container_directories` (location votes, D-18).
  - `roles`, `layers.role_layers` and `layers.min_label_score` reach modules only through stem *names*
    (D-39), so they enter no module method: ids, memberships and confidences never depend on them.
  - Tests: U1 asserts that changing `directory_layers` changes both method strings, that
    `include_tests_in_metrics` changes the module method only, and that different vocabularies give
    different hashes. U5's method-coverage test is a guard: for every key of `INFERENCE_KEYS` and for
    `analysis.include_tests_in_metrics`, a non-default value that changes the ids, memberships, ranks or
    confidences of `inferModules`' (`inferLayers`') output on a rich synthetic model must also change the
    module (layer) method string.
- **D-57 (rounding).** §5.1 and ADR-007 say "six decimals". IR.md, which is normative, `roundMetric` and
  CONTRIBUTING say nine significant digits. The plan uses `roundMetric` everywhere and fixes ADR-007's
  wording (8.3). Recomputing `Σ weight × value` from the rounded values agrees within 1e-8.
- **D-58 (numbers in descriptions).** Descriptions format numbers with `toFixed`, which is exactly specified:
  percentages as integers, weights with one decimal, values with two or three. They are always formatted
  from the rounded value, so the text and the fields agree.
- **D-66 (heuristic wording; review #4).** ARCHITECTURE.md's truth table requires inferred conclusions to say
  so, and README and site/PRODUCT.md promise that "inference is heuristic and says so". Revision 1's
  templates stated heuristic classes as facts ("`src/main.ts` is a composition root"), and on the linker
  graph those classes include package barrels and feature files (P3). Therefore:
  - every `reason` begins with "Inferred:";
  - every description of a structural class, relocation or attachment names the rule, labels it
    "(Katedrala heuristic)" and states what triggered it, from `StructuralClasses` and `Relocation`. For
    example: "Treated as a composition root by the shape rule (Katedrala heuristic): no file outside its
    unit depends on it; its dependencies spread over 3 units, none above 50 %";
  - a composition root that is also a declared entry point or a barrel says which, before the rule:
    "`src/index.ts`: declared entry point and barrel, treated as a composition root because nothing in its
    package depends on it" (entry-point rule), so a package's public barrel never reads as wiring code;
  - descriptions of measurements (weighted signals) stay factual sentences about what was measured;
  - U4's and U2's template snapshot tests assert this wording, every variant included.
- **D-72 (bounded `relocated-files`; review #24).** At most `limits.maxEvidenceEntities` `relocated-files`
  entries per module, for the smallest file ids, as §5.2 bounds them. When files are omitted, one
  `relocated-files-omitted` entry with `value` = their count says so ("4 further files were reassigned here;
  entries are limited by limits.maxEvidenceEntities").

**Module signals** (`modules/explain.ts`, U4). The weighted signals are those of §5.2. The context signals:

| Signal | Value | Entities | Template |
| --- | --- | --- | --- |
| `feature-directory`, `layer-directory`, `shared-directory`, `root-files`, `file-stem`, `split-piece` (D-48) | — | the anchor directory | "Inferred from the feature directory `src/catalog`." (one per module) |
| `organization-style` | stem coverage when the group has ≥ 2 layer children | the group's classified children | "Directory classification (Katedrala heuristic, directory vocabulary): `src` has 4 layer directories (controllers, models, repositories, services); file-name stems order, payment and user recur across them and cover 14 of 14 files." Variants for `feature`, `layer`, `mixed` and `none`. |
| `relocated-files` (one per file moved *in*, capped, D-72) | share of the dependents' weight in this module | the file | "Reassigned here by the strict-majority rule (Katedrala heuristic): `src/catalog/price-calculator.ts` has 3 of its 4 dependents (weight 3.0 of 4.0) and all of its dependencies (2.0 of 2.0) in this module." For a lone file: "... it was the only file left in `src/clients`, so one dependent suffices." |
| `relocated-files-omitted` | count | — | D-72 |
| `single-user-files` | count | those files | "3 files are used by only one module: session (cart), slug (catalog), validation (checkout)." |
| `composition-roots`, `utility-files`, `facade-files` (D-49, D-66) | count | those files | "Treated as composition roots by the orchestrator rules (Katedrala heuristic) and not counted as evidence: `src/main.ts` (entry-point rule: a declared entry point that nothing depends on); `src/index.ts` (entry-point rule: a declared entry point and barrel that nothing in its package depends on); `src/app.ts` (shape rule: nothing outside its unit depends on it; its dependencies spread over 3 units, none above 50 %)." Utilities: "Treated as shared utilities by the utility rule (Katedrala heuristic), pinned and not counted as evidence: `src/core/logger.ts` (its dependents lie in 4 other units)." Facades: "Treated as barrels by the facade rule (Katedrala heuristic) and pinned to their directory: `src/domain/index.ts` (5 of its 5 dependencies are re-exports)." At most `maxEvidenceEntities` per-file clauses. |
| `attached-files` (D-64) | count | the attached files | "Attached for navigation (Katedrala heuristic): 1 test file and 0 declaration files; 0 by a strict majority of the modules they depend on (or that depend on them), 1 by location in `src/orders`." |
| `oversized-directory` | node count of the split directory | the directory | "Part of the oversized directory `src/lib` (420 files), grouped by dependencies." |
| `anchor-drift` | share under the anchor | — | §5.2 template, emitted only below 0.5 |

Reason templates (`InferenceInfo.reason`, one sentence, D-66):

- stem module: "Inferred: files named `payment.*` in 4 layer directories form a connected group; 75% of their
  dependency weight stays inside."
- directory module: "Inferred: directory `src/catalog` with 1 file reassigned in and 1 out; 85% of the
  dependency weight stays inside."
- layer-directory module: "Inferred: layer directory `src/domain` in a layer-organized source tree; no
  file-name stem recurs across its layers."
- shared module: "Inferred: shared directory `src/common`; 1 of 4 files is used by two or more modules."
- root module: "Inferred: the top-level files of `src` (2 files); 1 is treated as a composition root, barrel
  or declared entry point." (typescript-features' root module has 9 files, of which 2 are composition
  roots; revision 1's "composition root and wiring" overstated it.)
- split piece: "Inferred: part of the oversized directory `src/lib` (420 files), grouped by dependencies
  around the stem `format`."
- P4 remainder: "Inferred: directory `src/lib` (oversized; 420 files grouped into 6 pieces); these 12 files
  have no edge to a piece."
- When `internal-edge-ratio` is absent, the "% stays inside" clause becomes "no member has dependency
  evidence inside the package".

- **D-48 (module kind).** The IR has no module kind, and the design keeps it implicit in which weighted
  signals a module carries. Feature, stem and split modules share one set, so consumers (anomalies in M7,
  CodeVerse) and fixture tests could not tell them apart. One context signal per kind, listed above, makes
  the kind explicit without an IR change. Q-1 asks whether to promote it to a `ModuleAnchor.kind` field
  later.
- **D-49 (pinned files).** The design's single `pinned-files` signal is split into `composition-roots`,
  `utility-files` and `facade-files`. Each set then has its own entities, which the `compositionRoot` fixture
  key and M7's god-component exemption need.
- **D-64 (`attached-files`; review #2).** Attaching is an inference (strict majority, else location), but
  revision 1 recorded no evidence for it. nestjs `orders.service.spec.ts` depends on two orders files and two
  payments files, so it is attached by location and appeared in `files` with no explanation, against
  ARCHITECTURE.md's principle 2 and README's "every inferred grouping carries … the observations behind
  it". ALGORITHMS.md and IR.md document the signal. U4 tests cover both rules and the counts.

**Layer signals** (`layers/explain.ts`, U2):

- Weighted: `label-agreement`, `direction-consistency`, `order-support`, `layer-size`.
- Context:
  - `role-sources`: "3 members by location and naming, 1 by location only".
  - `upward-dependencies`: on the *depending* layer of each removed arc; value is the weight; entities are
    the depending files; the description states the type-only share (D-51).
  - `conventional-order`: on both layers of each conventional arc; entities are the layer ids. "Placed after
    `controller` by the conventional tier order (Katedrala heuristic): no observed dependency path connects
    them."
  - `misplaced-by-name`: files whose naming vote names another layer than their location vote.

The reason follows §4.5's template with the "Inferred:" prefix. It is built from the dominant location
directory (the most frequent among members; ties go to the smallest path) or from the naming pattern, the
layers that depend on this one and the layers it depends on, and the rank: "Inferred: `src/controllers`
holds 3 files named `*.controller.ts`; nothing depends on this layer and it depends on `service` (rank 0)."

**Role evidence** (U2), one entry per signal, each naming the rule and the vocabulary entry (D-66):

| Signal | Value | Entities | Template |
| --- | --- | --- | --- |
| `name-qualifier` | 0.8 | the file | "Naming rule (Katedrala heuristic): the file name `payment.controller.ts` has the qualifier `controller`, which the naming vocabulary maps to `http-controller`." |
| `name-suffix` | 0.6 | the file | analogous, "ends with the word `service`" |
| `type-name-suffix` | 0.6 | the class symbol | analogous, "the exported class `UserService` ends with the word `service`" |
| `directory-name` | 0.7 | the directory | "Location rule (Katedrala heuristic): the file lies in `src/controllers`, which the directory vocabulary maps to the layer `controller`." |
| `configured-glob` | 1.0 | — | "The file matches `inference.roles.http-controller`." |

`katedrala explain` (§5.4) renders exactly these fields in M11. Nothing in M5 depends on the rendering.

### 4.7 Complexity summary (§7)

| Step | Time | Memory | Notes |
| --- | --- | --- | --- |
| weighted graph(s) | O(n + m_IR) | O(n + m) | from the model's memoized file projections; at most 3 distinct specifications (module nodes, source files, attachment) |
| components | O(F · D) | O(F + dirs) | |
| roles and labels | O(F + Σ path depth + classes) | O(F) | |
| P1 / P2 / P3 | O(n · D) / O(n + m) / O(n + m) | O(n) | P3 worklist (D-30) |
| P4 | O(m_U log m_U) per oversized unit | O(n_U + m_U) | |
| P5 | O(passes · (n + m)) | O(n + U) | typed arrays, integer tie-breaks, exact sums |
| P7 / P8 / P9 | O(F_att · D + m_att) / O(n + m_imports) / O(n + m) | O(n) | P8 on a memoized imports projection |
| layers | O(F + m + 2^k k² + L³) | O(F + L²) | k ≤ 12 by default |
| aggregation | O(m_metrics) per level, plus 1 extra `ArchitectureModel` (D-60) | O(size) | |

**D-60 (index builds).** Building `ArchitectureModel.from` re-sorts every edge (`DocumentIndex`). M5 builds
the model three times:

1. the structure model, built by `analyzeStructure`;
2. `unitsModel`, over the structure plus the final units with empty dependency lists, used for aggregation
   and later reused by M6;
3. the public model over the final document, built by the engine.

The extra builds are linear in document size, measured by the scale test, and are an explicit M13 item
("reuse the structural index"). The alternatives either break the model's contract that a model is a view of
its document, or duplicate `aggregateDependencies`.

### 4.8 Determinism (§8)

- No randomness, no clock, no locale, no Unicode tables. The lint block of 2.1 enforces the first three;
  tokenization and case folding are ASCII-only (D-05).
- Iteration orders:
  - scopes in id order;
  - nodes ascending, which is file-id order;
  - directories in path order;
  - stems and keys by compareStrings, through integer ranks.
- Exact arithmetic: weights are dyadic (D-67), so every sum is exact and every tie is decided exactly. Float
  sums still run in CSR order, and the exact ordering DP sums in index order. Louvain is deterministic,
  warm-started and runs with pinned parameters (D-68).
- Configuration key order never carries meaning (D-23), so the canonical configuration JSON in
  `analysisDigest` describes everything inference reads.
- Outputs are canonical as produced. A test checks idempotence:
  `canonicalizeDocument({ ...emptyDocument(), ...sections })` deep-equals the sections.
- Description text is built only from rounded values and `toFixed`.

---

## 5. Configuration

### 5.1 Ownership and flow

```text
katedrala.config.yaml
  └─ core parseConfiguration(sections = INFERENCE_CONFIGURATION_SECTIONS ∪ caller sections)   [engine registers]
       └─ validated config (no defaults injected → same canonical JSON → same analysisDigest)
            ├─ engine resolveDeclarations(files, { modules, layers, inference.roles })        createPathMatcher
            │     → Declarations { modules (sorted by name), layers? (list order), roles, configurationFile? }
            ├─ inference resolveInferenceSettings(config.inference, { includeTestsInMetrics })
            │     → InferenceSettings (+ method strings)                       (same core settings field ↓)
            └─ engine metricsProjectionOptions(core settings) → ProjectionOptions
                  └─ inferArchitecture({ model, settings, declarations, projection, repositoryName })
```

- Core keeps `modules`, `layers` and `inference` in `RESERVED_CONFIGURATION_SECTIONS`; they are reserved, not
  core sections. The engine registers their validators (ADR-013). `analyzeStructure` alone keeps the
  "not evaluated" warning.
- **D-59 (validators in the engine).** §6 has `@katedrala/inference` register its own validators. That would
  give inference dependencies on `zod` and on core's glob validation, against the packages table (ir,
  graph, model) and against keeping the analysis packages browser-capable. The engine already depends on
  both, so it owns the validators and the glob resolution. Inference owns the configuration *types*, the
  defaults (`resolveInferenceSettings`), the key lists (`INFERENCE_KEYS`) and the name normalization; the
  validators are checked against those (5.2).
- Globs use core's semantics:
  - picomatch, relative to the analysis root;
  - dotfiles included;
  - ancestors match;
  - `!pattern` excludes for the whole list.

  Module, layer and role globs therefore behave like `include`, `exclude` and `roles`, except that they need
  a positive pattern (D-71).

### 5.2 Schema (`packages/engine/src/inference-configuration.ts`)

```ts
type Section<K extends keyof InferenceConfiguration> = NonNullable<InferenceConfiguration[K]>;

const name = z.string().refine((s) => s.trim() === s && s !== "", "Expected a non-empty name without surrounding spaces");
const moduleName = name.refine((s) => !/[#~]/.test(s), 'Module names must not contain "#" or "~"');
const kebab = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Expected a kebab-case layer name");
const role = z.union([z.enum(ARCHITECTURAL_ROLES), z.string().regex(EXTENSION_VALUE_PATTERN)]);
const unit = z.number().min(0).max(1);
// D-67: weights are dyadic, so weight sums are exact.
const lattice = unit.refine((w) => Number.isInteger(w * 1024),
  "Expected a multiple of 1/1024 between 0 and 1 (for example 0, 0.25, 0.5 or 1), so that weight sums are exact");
const vocabularyEntry = z.string().regex(/^!?[^!\s][^\s]*$/, 'Expected a name, or "!name" to remove a default');
// D-71: a list of exclusions only would claim every other file.
const memberGlobs = globListSchema.min(1).refine((globs) => globs.some((g) => !g.startsWith("!") || g.startsWith("!(")),
  'Expected at least one pattern that is not an exclusion ("!…")');

export const modulesSectionSchema = z.record(moduleName,
  z.union([memberGlobs, z.strictObject({ files: memberGlobs, entry: globListSchema.min(1).optional() })]));

export const layersSectionSchema = z.array(z.strictObject({
  name, files: memberGlobs, rank: z.number().int().nonnegative().optional(),
})).min(1).superRefine(uniqueBy("name"));

const componentsShape = {
  file_roles: z.array(z.enum(FILE_ROLES)).min(1).optional(),
} satisfies Record<keyof Section<"components">, z.ZodType>;

const modulesShape = {
  enabled: z.boolean().optional(),
  when_declared: z.enum(["infer-rest", "none"]).optional(),
  file_roles: z.array(z.enum(FILE_ROLES)).min(1).optional(),
  type_only_weight: lattice.optional(),
  min_edge_confidence: unit.optional(),
  max_module_files: z.number().int().min(2).optional(),
  min_module_files: z.number().int().min(1).optional(),
  stem_min_coverage: unit.optional(),
  utility_min_modules: z.number().int().min(2).optional(),
  move_min_support: z.number().int().min(1).optional(),
  move_min_weight: z.number().gt(0).optional(),
  max_passes: z.number().int().min(1).optional(),
  attach_tests: z.boolean().optional(),
  attach_declarations: z.boolean().optional(),
  container_directories: z.array(vocabularyEntry).optional(),
  shared_directories: z.array(vocabularyEntry).optional(),
  generic_tokens: z.array(vocabularyEntry).optional(),
} satisfies Record<keyof Section<"modules">, z.ZodType>;

const layersShape = {
  enabled: z.boolean().optional(),
  directory_layers: z.record(z.string().min(1), kebab.nullable()).optional(),
  role_layers: z.record(role, kebab.nullable()).optional(),
  naming_suffixes: z.record(z.string().min(1), role.nullable()).optional(),
  conventional_tiers: z.array(z.array(kebab).min(1)).superRefine(eachLayerOnce).optional(),
  min_label_score: unit.optional(),
  min_layer_files: z.number().int().min(1).optional(),
  exact_order_max_layers: z.number().int().min(2).max(16).optional(),
} satisfies Record<keyof Section<"layers">, z.ZodType>;

const inferenceShape = {
  roles: z.record(role, memberGlobs).optional(),
  components: z.strictObject(componentsShape).optional(),
  modules: z.strictObject(modulesShape).superRefine(minNotAboveMax).superRefine(distinctNormalizedNames).optional(),
  layers: z.strictObject(layersShape).superRefine(distinctNormalizedKeys).optional(),
} satisfies Record<keyof InferenceConfiguration, z.ZodType>;

export const inferenceSectionSchema = z.strictObject(inferenceShape);

// Zod infers optional properties as `T | undefined`, which exactOptionalPropertyTypes distinguishes from
// absent properties; validated values never contain explicit `undefined` (zod keeps absent keys absent).
// Core's createConfigurationSchema casts for the same reason. The cast cannot check the types; the
// `satisfies` clauses above check the keys, and a test compares them with INFERENCE_KEYS.
export const INFERENCE_CONFIGURATION_SECTIONS = {
  modules: modulesSectionSchema as unknown as z.ZodType<ModulesConfiguration>,
  layers: layersSectionSchema as unknown as z.ZodType<LayersConfiguration>,
  inference: inferenceSectionSchema as unknown as z.ZodType<InferenceConfiguration>,
} as const;
```

Revision 1 claimed that typing the schemas as `z.ZodType<…Configuration>` keeps types and validators from
drifting apart. Under `exactOptionalPropertyTypes` that assignment needs `as unknown as`, which removes the
guarantee (review #15). The guarantee now comes from three checks:

- each shape `satisfies Record<keyof Section, z.ZodType>`: a missing or extra key is a compile error;
- an engine test compares the shapes' keys with `INFERENCE_KEYS`;
- an engine test checks the value types: `DEFAULT_INFERENCE_CONFIGURATION` (every key at its default, 3.3)
  validates, and `resolveInferenceSettings` of the validated value equals `resolveInferenceSettings()`,
  bare method strings included.

Unknown keys are errors. Core's `toIssues` already reports them with the key's line and a "did you mean"
suggestion through `knownKeysAt`. Union branches give no suggestions, which is acceptable.

In zod 4 (4.6.5 here), a record whose key schema has a finite set of values is exhaustive: every key must be
present. The `role` key schema includes the open `x-` branch, so `inference.roles` and `role_layers` stay
partial maps; a key schema made of the enum alone would reject every configuration that names only some
roles. The engine tests validate partial `roles` and `role_layers` maps.

Cross-field rules:

- `min_module_files ≤ max_module_files` (with defaults applied for the comparison);
- tier names appear in only one tier;
- declared layer names are unique;
- no two names of one vocabulary list or map normalize to the same name (D-69, `normalizeVocabularyName`).

YAML mapping keys are already unique, because the parser uses `uniqueKeys: true`.

### 5.3 Defaults

These are the design's §6.3 defaults, plus the decisions above.

| Key | Default | Note |
| --- | --- | --- |
| `inference.components.file_roles` | `[declaration, generated, script, source, test]` | |
| `inference.modules.enabled` / `when_declared` / `file_roles` | `true` / `infer-rest` / `[source]` | D-21 |
| `type_only_weight` / `min_edge_confidence` | 0.5 / 0.5 | shared by modules and layers (D-51); `type_only_weight` is a multiple of 1/1024 (D-67) |
| `max_module_files` / `min_module_files` / `stem_min_coverage` | 120 / 3 / 0.25 | |
| `utility_min_modules` / `move_min_support` / `move_min_weight` / `max_passes` | 3 / 2 / 1.0 / 50 | the shared/root utility threshold 2 is a constant (D-31) |
| `attach_tests` / `attach_declarations` | `true` / `true` | attachment policy D-65: declarations, and tests when `analysis.include_tests_in_metrics` is set, by strict majority only |
| vocabularies | 4.1.3 | normalized (D-69); `!name` removes; maps merge, `null` removes |
| `inference.layers.enabled` | `true` | ignored when `layers` is declared |
| `min_label_score` / `min_layer_files` / `exact_order_max_layers` | 0.5 / 2 / 12 | |
| vote confidences | configuration 1.0, naming qualifier 0.8, word and type-name suffix 0.6, location 0.7 | constants, documented |
| Louvain parameters | D-68 | constants, documented |

### 5.4 Declared modules and layers

`resolveDeclarations` (engine, U5) works as follows.

1. Iterate `document.files` once per declaration, in file id order. `createPathMatcher(globs)` gives sorted
   `FileId` lists.
2. Modules are sorted by name (D-23). The short form becomes `{ files }`; the long form adds `entry`.
3. Layers keep list order, and `rank` defaults to the index.
4. Roles are sorted by role.

Policy is then applied inside inference:

- role filters (D-22, D-50);
- overlap resolution, with warnings: by name for modules (D-23), by list order for layers (D-50);
- empty-match warnings for modules and layers (D-71);
- the `~inferred` suffix when an inferred key equals a declared name;
- `when_declared`.

### 5.5 Digest and compatibility

- **D-61 (no defaults in schemas).** Validators parse without transforming: no `.default()` and no
  `.transform()`. `configuration.canonicalJson` is therefore identical with and without them. The analysis
  digest is computed in `analyzeStructure` from that JSON, so it covers every inference parameter and does
  not depend on which entry point ran. Defaults live only in `resolveInferenceSettings`. Because no
  inference semantics depend on key order (D-23), the canonical JSON loses nothing that changes a result.
- A configuration written for M5 still loads in `analyzeStructure`, with the existing warning.
- dependency-violations' `modules:` short form validates unchanged. Its `groups` and `rules` sections keep
  their "not evaluated" warning until M8.

---

## 6. Work split

The milestone splits into five units. Each owns its files exclusively (see 2.2; two files change owner once,
at a fixed point). Common definition of done for every unit:

- `pnpm check` passes, including the lint restrictions of 2.1;
- TSDoc on every export, with complexity, determinism notes, references and the label [DERIVED] or
  [KATEDRALA HEURISTIC];
- no `Math.random`, `Date.now`, `localeCompare`, `toLocale*`, `Intl`, `\p{` classes, `toLowerCase` or
  `toUpperCase` outside `asciiLower`, or unsorted Map/Set iteration on an output path. Lint enforces the
  first five in inference; the reviewer greps for the rest;
- statement coverage ≥ 90 % for the unit's files;
- every decision implemented as numbered here, with the D-number in a code comment where the choice is
  made.

### 6.1 U1: Foundations

| | |
| --- | --- |
| **Files** | Package wiring and the minimal `src/index.ts` (handed to U5 after PR 1); `types.ts`, `vocabulary.ts`, `settings.ts`, `lexical.ts`, `directories.ts`, `weighted-graph.ts`, `evidence.ts`, `test-support.ts` and their tests; `packages/ir/src/ids.ts`, `ids.test.ts`; `packages/ir/src/canonical-json.ts` and its test, `packages/ir/src/index.ts`; `packages/core/src/util/canonical-json.ts`; docs/IR.md's Identifiers text for module keys (PR 1, then handed to U5); `model/projection.ts` (`forEachUnderlyingEdge`); `eslint.config.js`; root and engine manifests and the tsconfig reference; `pnpm-lock.yaml`. |
| **Provides** | Every type in 3.1. The helpers and constants in 3.2. `test-support.ts`: `syntheticModel(spec)` (files with roles, packages, exported classes, edges with kind, type-only and confidence, entry points; directories derived), `shuffledModel(model, seed)`, and `prototypeModel(fixtureName)`, a faithful port of `m5/fixture_graph.py` (review #8): `classify` for roles, package roots and names, entry points derived from `main`, `bin` and scripts (with the `dist/` → `src/` and `.js` → `.ts` mapping), edges from `expected.json` imports (`type` → type-only, `re-export` → `re-exports`), and barrel resolution (`exported_names` and `resolve_spec`, re-export depth ≤ 6) adding the prototype's `via-re-export` pairs as `uses` edges. With it the design's numbers can be replayed for every fixture, barrels included. |
| **Consumes** | ir, graph, model. |
| **Order** | **Lands first, in two pull requests.** PR 1 is self-contained (review #12): scaffold, the minimal `index.ts`, `types.ts`, `vocabulary.ts`, `settings.ts`, `lexical.ts` (normalization and the method strings need `sStem` and `asciiLower`), `canonicalJson` in `ir` with core's re-export, the module key derivation with its IR.md text, the manifests, the lockfile and `eslint.config.js`. Every other unit starts from it. PR 2, within days: `directories.ts`, `weighted-graph.ts`, `evidence.ts`, `test-support.ts`, the model change, and the linker-graph replay check: re-run `probe2/replay.probe.ts` against the merged vocabulary, lexical and weighted-graph code and post any difference from 7.3 in the PR, before U5 writes fixture assertions (review #7). U2–U4 write code against the signatures meanwhile. |
| **Tests** | Lexical: the §9.1 tables (tokens, S-stemmer, stems with role and generic tokens, plural, case kept); ASCII-only behavior with non-ASCII names (D-05). Settings: defaults; normalization (D-69); `!` removal; `null` in maps; the inverse location roles; method strings: no parameters → bare method; keys sorted; collections hashed; equal effective vocabularies give equal strings; different vocabularies give different hashes; changing `directory_layers` changes both method strings, and `includeTestsInMetrics` the module method only (D-56); `INFERENCE_KEYS` covers every key of the configuration types; `resolveInferenceSettings(DEFAULT_INFERENCE_CONFIGURATION)` equals `resolveInferenceSettings()`. Directory kinds: precedence; `domains`/`domain`; `libs`/`lib`. `sourceRoot` descent. Weighted graph: 1.0, `typeOnlyWeight` and 0 cases, D-01 mixed-confidence pairs, `type_only_weight = 0`, facade degrees, exclusion, sorted nodes, `restrictWeightedGraph` through `{ graph, mapping }`. Property: weights equal a brute-force recomputation from document edges on random documents. Evidence: the total order of 4.6, rounding, entity truncation, confidence = Σ weight × value, absent values. IR: the key cases of 3.5 item 1; `canonicalJson` unchanged (core's tests pass through the re-export). Model: visit order and no-op on invalid index. `prototypeModel`: for layered-architecture and clean-architecture, the edge list and entry points equal those of `fixture_graph.py` (pinned from a Python run). |
| **Done** | The above; the other units have consumed PR 1 without changes to `types.ts`; the replay check is posted. Afterwards, changes to `types.ts` need review by every unit. |

### 6.2 U2: Components, roles and layers

| | |
| --- | --- |
| **Files** | `components.ts`, `roles.ts`, `layers/partition.ts`, `layers/order.ts`, `layers/explain.ts`, `layers/layers.ts` and their tests. |
| **Provides** | `inferComponents`, `inferRoles` (labels for U3 and U4), `withRoles`, `inferLayers`. |
| **Consumes** | U1 types and helpers. |
| **Order** | Starts after U1 PR 1. Independent of U3 and U4. |
| **Tests** | Components: collapsed chains (`presentation/http` name), branch points without files, package roots without code, nested packages, several manifests, an unnamed root manifest, the root without a manifest, no owned files → `[]`, totals equal subtree sums. Roles and labels: each vote source; D-14 (the clean-architecture case: location 0.7 beats repository 0.6 with both file and class suffixes); noisy-OR across sources (0.94); ⊥ ties; label ties after `roundMetric`; outermost location; a `domains/` container gives no location vote (D-18); `locationRoles`; tests get no roles; detector entries vote and are kept; idempotence; role evidence wording (D-66). Layers: pruning and `< 2` layers; declared layers with overlap warning, empty-match warning (D-71) and ranks; the layer graph's weights and type-only shares; the exact DP against brute force (property, seeded, k ≤ 7, lattice weights, tiers partly absent, D-52); inversions only between tiered layers; greedy beyond the bound; conventional arcs never create cycles (property); conventional arcs in a repository without manifests (D-53); every kept observed arc goes to a strictly higher rank (property); direction consistency and order support by hand; `upward-dependencies` descriptions with the type-only share when `include_type_only` is false (D-51); template snapshots with the "Inferred:" reasons. Design replays on `prototypeModel`: layered-architecture (controller 0.939, service 0.925, repository 0.939, model 0.862, ranks 0–3, exactly the 4 layer dependencies) and clean-architecture (infrastructure 0.737 and presentation 0.795 at rank 0, application 0.795 at rank 1, domain 0.878 at rank 2, the four layer dependencies, none upward). |
| **Done** | §4.6's layered and clean numbers are reproduced exactly on the prototype graphs (review #8); components reproduce §2.4 on synthetic copies of the monorepo and clean-architecture trees. |

### 6.3 U3: Module clustering (P1–P6)

| | |
| --- | --- |
| **Files** | `modules/prior.ts`, `stems.ts`, `classes.ts`, `split.ts`, `reassign.ts`, `identity.ts`, `cluster.ts`, `reference.test-support.ts` and their tests. |
| **Provides** | `clusterScope(scope, context): ScopeClustering`, including the class triggers of `StructuralClasses` (D-66). |
| **Consumes** | U1 types and helpers. `FileLabel`s, through a synthetic `labels` map in tests. |
| **Order** | Starts after U1 PR 1. U4's integration test waits for U3. |
| **Tests** | P1: source-root descent; containers; the size cap at 120/121; loose-file kinds (D-25). P2: connectivity required; coverage at 0.249, 0.25 and 3/10 against 0.3 (D-67); the sub-directory stem rule; joining a feature child and the smallest-path tie-break (D-70); union of components (D-27, synthetic); style `none` and `mixed`. P3: utility thresholds at 2 and 3 (shared or root and other kinds); each orchestrator condition failing alone; the entry-point rule; facades at exactly 50 %; recorded triggers (rule, unit counts); worklist equal to naive passes (property, random graphs). P4: `inducedSubgraph` mapping; split with warm start; `LOUVAIN_OPTIONS` passed in full (D-68); small-piece merging and ties; remainder; key dedupe against P2 stems; fallback keys `format-date-ts` and the hash (D-34). P5: each of the five conditions failing alone; singleton absorption; the cascade of D-74 (synthetic copy of monorepo's `@acme/core`); tie by smallest key; immediate updates; the `maxPasses` bound and `converged`; equality with the naive reference implementation on random graphs (property, lattice weights). P6: keys (`.`, `.#stem`, escaped directories), names (package without npm scope, repository name, plural entity, already plural head, mass nouns, original case, fallback pieces). Properties (review #27): every kept P2 stem component is connected and spans at least two layer children; every P4 piece except the remainder is connected. Design replays on `prototypeModel`: all eight §3.6 rows (groups, layer children, recurrent stems, coverage, style); §3.16's memberships for layered-architecture, ambiguous-boundaries (the three relocations with §3.9's in/out weights), clean-architecture (style `layer`, no stems), tangled-architecture and dependency-violations. |
| **Done** | The §3.6 table (all eight rows) and §3.16's memberships for layered-architecture, ambiguous-boundaries, clean-architecture, tangled-architecture and dependency-violations are reproduced on prototype graphs (review #8). |

### 6.4 U4: Module stage (declared modules, P0, P7–P9, evidence)

| | |
| --- | --- |
| **Files** | `modules/declared.ts`, `scopes.ts`, `attach.ts`, `surface.ts`, `confidence.ts`, `explain.ts`, `modules.ts` and their tests. |
| **Provides** | `inferModules(input): ModulesResult` (module drafts with `inference`, plus diagnostics). |
| **Consumes** | U1, U3 `clusterScope`, U2 labels (through the input). |
| **Order** | Starts after U1 PR 1. P7–P9 and the declared modules are tested with hand-built `ScopeClustering` values. `modules.ts` integration after U3. |
| **Tests** | Declared: overlaps resolved by name and warned once per module pair, with the count and bounded example paths (D-23); role filter (D-22); empty match; `~inferred`; `when_declared` and `enabled`. P0: scope order; no cross-scope edges; declared files are not nodes. P7 (D-65): majority; majority to a declared module → unassigned; majority to another scope → unassigned; declarations without a majority → unassigned; tests without a majority → location by direct nodes and ancestors; `include_tests_in_metrics` → tests by majority only; nodes skipped; flags off; `attached-files` evidence for both rules and both roles (D-64). P8: index and facade in the anchor directory; declared `entry`; declared without entry (D-43); `publicApi` from imports and re-exports only (D-63): on `prototypeModel("clean-architecture")`, `mod:src/domain` contains `index.ts` and not `ports/member-repository.ts`; attached members and unassigned sources excluded. P9: replay of §3.13's worked example (`mod:src#payment` 0.807: 0.750, 0.800, 1.000, 0.714); all §3.16 confidences on prototype graphs for layered-architecture (0.807, 0.888, 0.730, 0.843, 0.867), ambiguous-boundaries (0.844, 0.801, 0.894, 0.558, 0.867), clean-architecture (0.551, 0.780, 0.600, 0.797, 0.867), tangled-architecture (0.551, 0.644, 0.548, 0.576, 0.695, `lib` 0.920, root 0.867) and dependency-violations (0.751, 0.680, 0.725, 0.367, 0.750); `wiring-share` counts each member once (layered `mod:src` 0.867, not 1.167). Weights sum to 1 per kind. Rounded recomputation within 1e-8. Absent signals listed. Kind signals. Templates: a snapshot of every description and reason variant, asserting the D-66 wording. `relocated-files` capped with the omitted count (D-72). Entity truncation. |
| **Done** | The above, plus `inferModules` on prototype graphs gives §3.16's member lists and confidences for the five fixtures named above (review #8). |

### 6.5 U5: Integration (pipeline, engine, configuration, IR documentation, fixtures, docs)

| | |
| --- | --- |
| **Files** | `infer.ts`, `index.ts` (from U1 PR 1 on), `README.md`, `scale.test.ts`, `infer.test.ts` (inference); the engine files listed in 2.2 and their tests; the core glob export; the IR TSDoc (`types/architecture.ts`, `structure.ts`, `common.ts`) and the regenerated schemas; docs/IR.md (from U1 PR 1 on); `tests/fixtures/*.test.ts` and `golden/`; the dependency-violations README; docs/ALGORITHMS.md, ARCHITECTURE.md, ROADMAP.md, CONTRIBUTING.md; the root README.md. |
| **Provides** | `inferArchitecture`, `analyzeArchitecture`, `ArchitectureSections`, `ArchitectureAnalysis`, `INFERENCE_CONFIGURATION_SECTIONS`, `metricsProjectionOptions`, `resolveDeclarations`, golden documents, documentation, and the landing-page follow-up list for the site owner (8.4). |
| **Consumes** | Everything above. |
| **Order** | Engine configuration (validators, declarations, metrics projection, stage wiring) starts after U1 PR 1. `infer.ts` and the fixture tests start once U2–U4 have landed. The IR TSDoc, the schemas and IR.md's semantic sections are written after U4 lands (review #14). Docs are drafted throughout and finalized last. |
| **Tests** | 7.2–7.6. `infer.ts`: cross-references (`ComponentEntity.modules` and `ModuleEntity.components` consistent with memberships); the aggregation property (on random documents, Σ edgeCount over a level's dependency lists equals the number of underlying cross-unit IR edges of the metrics projection; both directions mirror each other); idempotence (`infer(doc ⊕ infer(doc)) = infer(doc)`); determinism under `shuffledModel` (byte-identical serialized sections); the InferenceInfo property of 7.1; method coverage (D-56). Engine: schema acceptance of §6.1's example and of partial `roles` and `role_layers` maps; error messages and lines for unknown keys, ranges, `#`/`~` names, duplicate layer names, duplicate tiers, exclusion-only glob lists (D-71), `type_only_weight: 0.3` (D-67), names that normalize alike (D-69); the shapes' keys equal `INFERENCE_KEYS`; `DEFAULT_INFERENCE_CONFIGURATION` validates and round-trips (5.2); the section-conflict `TypeError`; glob resolution; modules sorted by name and reordering overlapping modules in an explicit configuration file giving byte-identical documents and equal digests (D-23); `ANALYSIS_STAGES` and `timings.inference`; strict-schema validity of `{ ...emptyDocument(), ...document }`; same `analysisDigest` as `analyzeStructure`; roles merged; diagnostics sorted; `analysis.include_tests_in_metrics: true` gives both a metrics projection with `test` and `testsInMetrics` with its method parameter (D-56, D-65). |
| **Done** | `pnpm check` passes. The todo count drops from 76 to 55. Goldens are committed after a review against §3.16, §4.6 and the replay (7.3), with every difference explained in the PR and in ALGORITHMS.md "Results on the fixtures". The perturbation measurements are recorded (7.1). The scale tests run (default size in CI, full size opt-in), and their measured times and heap are recorded in ROADMAP's M13 notes. Docs follow section 8, and the site owner has the follow-up list (8.4). |

### 6.6 Order and parallelism

```text
U1 PR 1 (types, vocabulary, settings, lexical, canonicalJson, ids, wiring, lint)
  ├──► U2 (components, roles, layers) ──────────────────────────────────────┐
  ├──► U3 (P1–P6) ──► U4 integration (modules.ts) ──────────────────────────┤
  ├──► U4 unit-level work (declared, P0, P7–P9, explain) ───────────────────┤
  └──► U5 engine work (validators, declarations, projection, stage) ────────┤
U1 PR 2 (directories, weighted graph, evidence, test support, model,        │
         replay check) ──► needed by the U2–U4 tests and by U5's fixtures   │
                                                                            ▼
        U5: infer.ts, fixture tests, goldens, IR TSDoc and schemas, IR.md semantics, docs
```

The critical path is U1 PR 1 → U3 → U4 integration → U5 fixtures and goldens. U2, U4's unit-level work and
U5's engine work proceed in parallel with U3. The fixture expectations no longer wait for the end of the
critical path: the linker-graph replay ran for this revision (7.3), and U1 PR 2 re-checks it.

---

## 7. Test plan

### 7.1 Unit and property tests

The tests per unit are listed in section 6. The properties of §9.2, with the scope they actually hold for,
plus those the review asked for (#27, #28):

| Property | Where | Precise statement |
| --- | --- | --- |
| Determinism | U5 `infer.test.ts`, fixtures | Shuffling every array of the input (files, edges, directories, packages, symbols, entry points) gives byte-identical serialized `components`, `modules`, `layers` and roles. Fast-check, seeded. |
| Partition invariants | U5 | Every owned file is in exactly one component; component files partition the owned files; totals equal subtree sums; parent and children are consistent. Every inference node is in exactly one module when inference is enabled. Declared members equal their glob matches ∩ owned roles. No inferred module contains a declared file. Inferred modules never span packages, attached files included. Each file is in at most one layer; tests and declarations are in no layer. |
| InferenceInfo | U5 (random documents) | Every `value` and every confidence is in [0, 1]; confidence = Σ weight × value of the rounded entries within 1e-8; the weights of each kind sum to 1; evidence follows the order of 4.6; every `reason` begins with "Inferred:". |
| Identity | U3, U5 | Module ids are unique. The anchor is consistent with the id. Every inferred id belongs to a prior unit's key (+ `~inferred`), so moving a file between existing modules never creates or renames an id. |
| Structure and cohesion | U3 | Every kept P2 stem component is connected and spans at least two layer children. Every P4 piece except the remainder is connected. |
| Locality | U5 | Adding a package (files and edges into existing packages) leaves the ids and node members of the other packages' modules unchanged. Attachments may change: a declaration's new dependents in the added package are candidates (D-65) and can remove its majority. Renaming a feature directory to another feature name, when no file outside it is connected to its files, changes no other module. The design's broader "adding an internal edge changes nothing" is not asserted as a property, because P2 connectivity and orchestrator condition (iv) are deliberately non-local (§3.10). Its measured counterpart is the internal-addition perturbation below. |
| Idempotence | U5 | Declaring the inferred modules (their files as globs) reproduces the same memberships. Running inference on its own output gives the same sections (D-20). |
| Path invariance | U5 | Prefixing every path, package path included, with `x/` changes module ids only by the prefix (`.` becomes `x`) and leaves memberships unchanged. |
| Exactness | U2 | The exact ordering DP equals brute force for k ≤ 7 (lattice weights). Conventional arcs never create cycles. Ranks strictly increase along kept observed arcs. |
| Reference equality | U3 | The P3 worklist equals repeated passes. P5 equals the naive implementation. |
| Structural sections unchanged | U5 `tests/fixtures/inference.test.ts` | For every fixture, `analyzeArchitecture`'s document without `components`, `modules`, `layers`, the inferred role entries (`naming`, `location`, `configuration`) and the inference stage's diagnostics serializes byte-identically to `analyzeStructure`'s without its "not evaluated" warnings for the `modules`, `layers` and `inference` sections (dependency-violations has one for `modules`; the `groups` and `rules` warnings stay in both). `structure.test.ts` switches to `analyzeArchitecture` (7.2), so this keeps `analyzeStructure` exercised on every fixture. |
| Bounded perturbation (review #28) | U5 `tests/fixtures/inference.test.ts` | On every fixture, three seeded perturbations of the document's edges, each followed by inference on a rebuilt model; a file "changes" when its module id differs or its module vanished: (a) removal: for every source-file pair with edges, all IR edges of that pair are removed; (b) addition: 40 seeded file pairs without an edge get an `imports` edge, as the design's experiment did; (c) internal addition: 40 seeded pairs inside one module get an `imports` edge. Each case changes the module of at most 2 files. The test reports mean, maximum and the share of unchanged cases per fixture and kind. With `KATEDRALA_REPORT=1` it also runs unconstrained Louvain (γ = 1, orchestrators and utilities removed) through the same harness for comparison. ALGORITHMS.md publishes these measurements, not the prototype's table. A case above the bound is analysed and fixed or justified in ALGORITHMS.md; the bound is not silently relaxed. |

### 7.2 Todo keys that become checks (21 of 76)

`tests/fixtures/structure.test.ts` switches from `analyzeStructure` to `analyzeArchitecture`, which returns a
superset; the structural checks are unchanged (7.1, "structural sections unchanged"). `Check.compute` gains a
second parameter, the fixture's full `expectations`, because the module keys are defined relative to the
listed files. Helpers:

- `moduleNamed(name)` asserts the name is unique;
- `kindOf(module)` reads the D-48 kind signal;
- `layerNamed(fixtureName)` maps through `sStem`, so `controllers` becomes `controller`;
- `importPairs(grouping)` groups the `imports` and `re-exports` IR edges between files by a file → group
  function (review #25).

Keys that fixtures/README.md or the fixture's README define over imports are computed from imports, as
defined. Each such check also asserts that the corresponding aggregated dependencies contain those pairs.
This keeps the check faithful to its definition and still exercises inference.

| Fixture | Key | Computed from | Notes |
| --- | --- | --- | --- |
| layered-architecture | `logicalModules` | For each expected name: node members of the module with that name ∩ all listed files | Files that are not listed are unconstrained. Names come from the entity-plural rule. |
| | `notInAnyExpectedModule` | Listed files that are in none of the modules named in `logicalModules` | `src/main.ts` is in the root module `shop-backend`. |
| | `moduleDependencies` | `ModuleEntity.dependencies` among modules named in `logicalModules`, by name | No import-based definition exists for this key. The root module is excluded by that restriction. |
| | `layers` | Expected names that exist as layers, ordered by rank; equal ranks fail | Ranks 0, 1, 2, 3. |
| | `layerDirectories` | Per layer: the expected directory if its members equal the source files under it, else their common directory | |
| | `layerDependencies` | `importPairs(file → layer)`, mapped back to fixture names; plus: contained in `LayerEntity.dependencies` | fixtures/README: "at least one import". |
| clean-architecture | `layers` | As above, listed names only | Infrastructure is not listed; 7.3 asserts it. |
| | `layerDirectories` | As above, every listed entry (infrastructure included) | `src/presentation` holds `presentation/http`. |
| | `layerDependencies` | As above | Exactly the four pairs. |
| | `compositionRoot` | The union of `composition-roots` entities over all modules, expected to be a single file | D-49. |
| ambiguous-boundaries | `features` | Names of modules with kind signal `feature-directory` | |
| | `misplaced` | Each `relocated-files` entity: `{ file, locatedIn: name of the module anchored on the file's directory, usedMostlyBy and dependsMostlyOn: name of the module holding it }` | Exactly three files. |
| | `misplacementEvidence` | Per relocated file: distinct dependent and dependency files through `imports`/`re-exports`, grouped by *directory* feature (the first directory under `src/`, feature directories only), as the README defines | Plus: the counts agree with the file's `relocated-files` evidence. |
| | `wellPlaced` | Feature-directory files that are not relocated | |
| | `grabBag` | `{ directory, usedBy }`: per common file, the features of the files that import it, a file's feature being its first directory under `src/` (feature directories only, so `server.ts` and `common/*` importers are excluded), as the README defines | Plus: the module view gives the same lists, and the `single-user-files` entities of `mod:src/common` are exactly the single-feature files (7.3). |
| | `logicalModules` | As for layered-architecture | |
| | `featureDependenciesAfterRelocation` | `importPairs(file → final module)` among `feature-directory` modules, by name | Plus: contained in the modules' aggregated dependencies. |
| | `featureCyclesAfterRelocation` | SCCs larger than 1 of that graph | `[]`. |
| dependency-violations | `declaredModules` | Declared modules → sorted member paths | |
| | `declaredModuleDependencies` | `importPairs(file → declared module)` | `payments → analytics`. Plus: contained in the declared modules' aggregated dependencies. |
| | `moduleCycles` | SCCs larger than 1 among **declared** modules (D-62) | The inferred `customers ↔ orders` cycle exists by design (§3.14). 7.3 asserts it. The fixture README row is clarified. |

- **D-62 (`moduleCycles`).** The fixture README defines `moduleCycles` as "cycles between modules (none)", in
  the context of the two declared modules ("the only dependency between the declared modules is payments
  -> analytics"). Inferred modules do form a cycle there: `customer.controller → order.service →
  customer.service`. §3.14 says that cycle must stay visible as an observation and not become a rule
  violation. The check therefore ranges over declared modules, and the README row is clarified to say
  so (8.4).

The other 55 todos stay todo:

- framework keys of express-app, fastify-app and nestjs-app;
- `violations`, `violationCountByRule` and `groups` (M8);
- `loggerInstability` and `orchestratorInstability` (M6);
- monorepo `undeclaredExternal` (M7) and `packageEntryPoints`;
- javascript-commonjs and typescript-features structure-detail keys.

Those structure-detail keys are not inference, and turning them into checks is a separate follow-up.

### 7.3 Per-fixture requirements and assertions (`tests/fixtures/inference.test.ts`, U5)

The assertions come from the linker-graph replay (`probe2/replay.out.txt`), not from the prototype's
summaries: §3.6, §3.16 and §4.6 were computed on approximate import graphs (review #7). Facts the reviewer
verified are marked (v). The replay found these differences from the design, each now an explicit
expectation:

- express-app: the controllers reach the services through `calls` edges (resolved through `container.ts`),
  so controller → service is observed, not conventional (v);
- non-import file pairs are common: clean 19, monorepo 16, tangled 13, typescript-features 7, express 4 (v);
- tangled-architecture has 7 utilities, not 3 (v);
- high-fan-out's `orchestrator.ts` reaches 10 adapters and 10 services, all runtime (v);
- singleton prior units are absorbed (express, fastify, high-fan-in), and monorepo's `catalog` cascades into
  `orders` (D-74);
- several module confidences differ (table below).

U1 PR 2 re-runs the replay; production results that differ from the replay are investigated as a bug in one
of them before goldens are committed.

| Fixture | Requirements from expected.json / README | Assertions (M5) |
| --- | --- | --- |
| simple-dependencies | — | Style `none` at `src` (one layer child, D-26). Modules `mod:src` (root: `app.ts` treated as a composition root by the shape rule, `index.ts` by the entry-point rule), `mod:src/services` (layer directory), `mod:src/utils` (shared). `layers = []` (only `service` survives pruning). Golden. |
| circular-dependencies | — | Style `feature` (`api` is the only layer child). `src/index.ts` is a declared entry point and barrel treated as a composition root, worded so (D-66). `src/demo/seed.ts` is a composition root by the shape rule. `src/shared/id.ts` is a utility. No relocation. `layers = []`. Golden. |
| layered-architecture | 6 keys (7.2) | Ids `mod:src#order`, `mod:src#payment`, `mod:src#user`, `mod:src/shared`, `mod:src`. `organization-style` coverage 14/14. `main.ts` is a composition root by the entry-point rule. Utilities exactly `shared/{database,errors,http,logger}.ts`. No relocation. Exactly 4 layers, ranks 0–3, with §4.6's confidences (0.939, 0.925, 0.939, 0.862; the replay reproduces them on the linker graph). No `upward-dependencies`. `shared/*` and `main.ts` in no layer. |
| clean-architecture | 4 keys | Style `layer`, no stem kept (coverage 0/24; `loan` stays two components, the design's connectivity example). Modules: the 4 layer directories plus `mod:src` (`library-lending`). `mod:src/domain`: `entryPoints` `[src/domain/index.ts]`; `publicApi` contains `index.ts` and not `ports/member-repository.ts` (D-63). Layers: infrastructure and presentation at rank 0, application 1, domain 2, with §4.6's confidences (0.737, 0.795, 0.795, 0.878; reproduced by the replay); rank(infrastructure) < rank(domain); 6 infrastructure files; no upward arc and no `upward-dependencies` evidence (review #26). The component tree of §2.4 holds, including `cmp:src/presentation/http` named `presentation/http`. |
| monorepo | README: "inferred modules never span packages" | Components exactly as §2.4 (ids, kinds, names, direct and total counts). `@acme/api`: `mod:packages/api/src` (`routes.ts`, `server.ts`) and `mod:packages/api/src/handlers` (the group `packages/api/src` has style `none`: one layer child). `@acme/core`: `mod:packages/core/src` (`index.ts`) and `mod:packages/core/src/orders` with `catalog/catalog.ts` and `catalog/product.ts` relocated in (D-74, §3.16 listed `catalog` separately). `@acme/shared`: `mod:packages/shared/src` (4 files). `@acme/web`: `mod:packages/web/src` (`App.tsx`, `main.tsx`) and `mod:packages/web/src/components`. Every module has one package. Layers `component` and `handler`, both rank 0, confidence < 0.4 (replay 0.295, D-55). |
| tangled-architecture | README: "infer no clean layering" | Modules are the 5 feature directories plus `mod:src/lib` and `mod:src`; no relocation. Utilities exactly `lib/db.ts`, `lib/events.ts`, `lib/money.ts`, `catalog/product-service.ts`, `checkout/order-history.ts`, `customers/customer.ts`, `customers/loyalty.ts` (v: the linker's `calls` and `uses` edges add dependents in other features). `catalog/index.ts` is a facade. Every feature module's confidence < 0.75 (replay 0.51–0.64). `layers = []`: only `service` survives pruning. |
| dependency-violations | 3 keys | Declared modules are exact. Inferred: `mod:src#customer` (customers), `mod:src#order` (orders), `mod:src#refund` (refund), `mod:src/repositories` (`database.ts`), `mod:src` (`main.ts`, `config.ts`); stems cover 10 of 11 files. No inferred module holds a declared file. The inferred module graph has the `customers ↔ orders` cycle, which documents the M8 requirement. Layers controller 0, service 1, repository 2, domain 3; declared-module files take part (`payments/checkout.ts` is in `service` through its class name). |
| high-fan-in | logger facts | Stem style at `src`, coverage 10/20 (email, inventory, order, user). `core/logger.ts` and `core/errors.ts` are utilities (`utility-files` of `mod:src/core`). `services/payment.service.ts` is absorbed into `mod:src#order` (singleton prior unit, D-74). Layers golden-pinned (api 0, route 1, job 2, service 3, store 4, storage 5; `job` is below `route` because of the conventional arc route → job). |
| high-fan-out | orchestrator facts | `src/main.ts` (entry-point rule) and `src/orchestrator.ts` (shape rule: 10 adapters and 10 services, exactly 50 % each, all runtime (v), sole dependent `main.ts`) are both composition roots; R-3 is resolved. Style `layer`, no stem (0/21). Layers `service` 0, `adapter` 1. |
| ambiguous-boundaries | 8 keys | Relocations exactly as §3.9, with its in/out weights (the replay reproduces them). `mod:src/common`: `shared-usage` 0.25 and `single-user-files` = session, slug, validation. `server.ts` is a composition root; `common/format.ts` a utility. `layers = []`. |
| javascript-commonjs | — | Style `mixed` (`plugins` feature, `lib` shared); no stem (0/6: `todo` stays two components). `mod:src/plugins` has no `internal-edge-ratio` value and confidence < 0.4 (design and replay 0.275). `mod:src/lib` is shared. `routes/index.js` (shape rule) and `server.js` (entry-point rule) are composition roots. Layers golden-pinned (route 0, view 1, service 2, store 2). |
| typescript-features | — | Modules `billing`, `customers`, `orders`, `ui` (layer directory), `utils`, `shared` and the root (9 files). `src/index.ts` and `src/cli.ts` are composition roots by the entry-point rule; `index.ts` is worded as a declared entry point/barrel (D-66). The four barrels are facades. `orders/order.ts` and `utils/money.ts` are utilities. `src/globals.d.ts` is unassigned (one dependent each in two modules, no location fallback for declarations, D-65), and no `mod:src/ui → mod:src` dependency exists. `layers = []` (only `presentation` survives pruning). |
| express-app | — | Stem modules `mod:src#order` and `mod:src#user` (coverage 10/18); each stem group is connected. `container.ts`, `config.ts`, `errors.ts`, `logger.ts` are utilities; `app.ts` and `routes/index.ts` are composition roots by the shape rule, `server.ts` by the entry-point rule; `controllers/index.ts` is a facade. `clients/stripe.client.ts` is absorbed into `mod:src#order` (D-74). `src/types/express.d.ts` is unassigned (no dependent, D-65). Layers: route 0; controller, middleware 1; service 2; client, repository 3; database, model 4 (§4.6's ranks). No `conventional-order` evidence between controller and service (v), and rank(controller) < rank(service). The conventional arcs are middleware → service, middleware → database, service → database, client → database, client → model and repository → database. |
| nestjs-app | — | Modules `orders`, `payments` (feature), `common`, `config` (shared) and the root `mod:src` (`app.controller.ts`, `app.module.ts`, `main.ts`). `orders.service.spec.ts` is attached to `orders` by location (2 orders against 2 payments dependencies), and its `attached-files` evidence says so (D-64). Layers controller 0, middleware 1, service 2, dto and model 3. Naming roles (review #26): the three controllers `http-controller`; `orders.service.ts`, `payments.service.ts`, `config.service.ts` `service`; `api-key.guard.ts` and `logging.interceptor.ts` `middleware` (plus location entries); `stripe.client.ts` `external-client`; the dtos `data-transfer-object`; the entities `data-model`; the four `*.module.ts` `module-definition`. `stripe.client.ts` gets no layer: a single naming-only vote is pruned. |
| fastify-app | — | Not in §4.6. Style `mixed`, stem `order` (coverage 4/8). `clients/shipping.client.ts` and `services/pricing.ts` are absorbed into `mod:src#order`, `hooks/auth.ts` into `mod:src/plugins` (D-74). `test/orders.test.ts` is attached to `mod:src` by majority (1 of 1). Invariants and golden otherwise. |
| all | — | Golden sections (7.4). Strict-schema validity. Running twice gives identical output. The structural-sections and perturbation properties (7.1). |

Replay and design confidences that differ (replay = scratch prediction; goldens pin production values; each
difference is explained in ALGORITHMS.md §10):

| Module or layer | Design (prototype graph) | Replay (linker graph) | Cause |
| --- | --- | --- | --- |
| clean `application` / `domain` / `infrastructure` | 0.551 / 0.780 / 0.600 | 0.512 / 0.727 / 0.650 | 19 non-import pairs (`calls`, `instantiates`, `references-type`, `implements`), not all of which the prototype's barrel resolution produces, and pairs the linker marks runtime where the prototype saw `import type` |
| tangled cart / catalog / checkout / customers / inventory | 0.551 / 0.644 / 0.548 / 0.576 / 0.695 | 0.532 / 0.607 / 0.570 / 0.514 / 0.638 | 4 more utilities removed from evidence; 13 non-import pairs |
| ambiguous cart / catalog | 0.844 / 0.801 | 0.812 / 0.777 | the `uses` pair `cart-service → catalog/product` |
| layered `user` | 0.730 | 0.747 | same pairs, but 7 pairs are runtime on the linker graph and type-only on the prototype's (e.g. `user.repository → models/user`): runtime symbol-level edges (calls and member uses through declared types) behind an `import type` line |
| dependency-violations customer / order | 0.751 / 0.680 | 0.746 / 0.685 | as above (6 pairs) |
| monorepo `@acme/core` | `catalog`, `orders` | `orders` (4 files) | D-74 |
| express `controller` order-support | 0.43 | 0.857 | observed controller → service |

Two kinds of numbers are treated differently.

- **Exact values on prototype graphs.** The design's exact values (confidences, coverage) are asserted on
  prototype graphs in U2–U4, which port the prototype's barrel resolution and entry points (6.1).
- **Linker graphs.** End-to-end fixture tests assert memberships, ids, names, classes, ranks and threshold
  inequalities from the table above. Exact values on linker graphs are pinned by the goldens, after review
  (R-1).

### 7.4 Golden sections

- **Format.** `tests/fixtures/golden/<fixture>.json` holds `{ components, modules, layers, roles }`, where
  `roles` maps paths to `RoleEntry[]` for files that have roles. Files are serialized with
  `serializeDocument`.
- **Updating.** `KATEDRALA_UPDATE_GOLDEN=1 pnpm test tests/fixtures` rewrites the files. Without the variable,
  any difference fails the test with a readable diff.
- **Review rule.** A golden change in a PR must be explained. CONTRIBUTING documents this (8.4).
- **Portability.** Goldens are platform-independent: `roundMetric`, `toFixed`, sorted iteration, exact
  arithmetic, ASCII-only lexing, and no locale.

### 7.5 Scale test (`packages/inference/src/scale.test.ts`, U5)

- **Generator** (seeded with `createRandom`): `N` files, N a multiple of 800, in directories of 160 files:
  four feature directories for every layer-organized group.
  - 80 % of the files sit in flat feature directories `src/features/f000…` (160 files, oversized and
    without subdirectories, so P1 keeps each as one unit and P4 splits it).
  - 20 % sit in layer-organized groups `src/apps/a000…/{controllers,services,repositories,models}`, 40 files
    per layer directory. A group holds 160 files, more than `max_module_files`, so P1 splits it and P2 runs
    on it; a group of 120 files or fewer would stay one feature-directory unit and form no stem module.
    `features` and `apps` are containers. In each group, 60 % of the files carry recurring stems: 24 stems
    (`s0001`, …: not generic tokens), each with one file in every layer directory, chained by edges
    (controller → service → repository → model). The other 40 % have unique stems.
  - Edges: `10 · N` file-to-file `imports` edges, 10 % of them type-only. Group files carry only their chain
    edges and edges among the non-stem files of their own layer directory, so that no group file gains a
    majority elsewhere. Feature files carry the rest: 80 % inside their directory, 20 % to other feature
    directories.
  - The document has `detail.symbols = false` and no provenance.
  - The model is built with `ArchitectureModel.from`; `inferArchitecture` runs with default settings.
- **Default size, always run:** N = 12 000 (60 feature directories, 15 groups, 120 000 edges).
  - Asserts the partition invariants, unique ids and an identical serialization over two runs.
  - Asserts, per layer group (review #35): every generated recurring stem is a stem module
    `mod:<group>#<stem>` with exactly its files, and every other file of the group stays in its
    layer-directory module.
  - Asserts no timings, following the graph package's convention.
- **Full size, opt-in:** `KATEDRALA_SCALE=1`, N = 100 000 (500 feature directories, 125 groups, 10^6
  edges), the design's §9.4 target.
  - Runs the same assertions.
  - Reports wall time and heap growth (`process.memoryUsage().heapUsed` after each size, N = 48 000 and
    100 000) without asserting them. A ratio asserted without forced garbage collection would be flaky
    (review #35). The values go to the PR and to ROADMAP's M13 notes; M13 sets the budgets.

### 7.6 Other checks

- Engine tests: see the U5 tests in section 6.
- `tests/fixtures/structure.test.ts` keeps its existing structure checks, which still pass on the superset
  analysis.
- CI runs `pnpm check`, which includes `schema:check` (the IR TSDoc changes cannot go stale) and lint (the
  restrictions of 2.1).

---

## 8. Documentation

### 8.1 docs/ALGORITHMS.md (new; U5; IR.md already links to it)

U2–U4 draft their sections in their PR descriptions; U5 integrates them.

1. **Conventions.** Truth labels ([ESTABLISHED], [KATEDRALA HEURISTIC], [DERIVED]) and the wording rule for
   heuristic conclusions (D-66); determinism, including ASCII-only lexing (D-05) and exact arithmetic
   (D-67); rounding with `roundMetric`; the signal ids form a contract.
2. **Shared definitions.** The weighted file graph (D-01–D-04, D-67); tokens and the S-stemmer (rule table);
   file stems; directory kinds and precedence; source roots; the default vocabularies in full (4.1.3) and
   the normalization of configured names (D-69).
3. **Components [DERIVED].** Rules, names, totals, monorepos, edge cases, complexity.
4. **Architectural roles [KATEDRALA HEURISTIC].** Sources and confidences; max within a source and noisy-OR
   across sources (D-14); location votes from layer-kind directories only (D-18); labels and ⊥; evidence
   signals; limitations (naming culture, `detail.symbols`, non-ASCII names).
5. **Modules.**
   - 5.1 Background [ESTABLISHED] (§3.1 condensed, with references). Louvain's connected refinement is
     described as guaranteeing connected communities only, and Leiden's further guarantees are named
     (review #29).
   - 5.2 Rationale and stability: the implementation's own perturbation measurements (7.1: removal,
     addition, internal addition; mean, maximum, unchanged share per fixture), with the same harness's
     unconstrained-Louvain column. The design's §3.2 table is cited only as the design-time motivation,
     labelled "prototype measurement on approximate graphs" (review #28).
   - 5.3–5.12 P0–P9, each with its rule, rationale, limitations and decisions. This includes condition 4 and
     its cascades (D-74), the pinned Louvain parameters (D-68), the fallback keys (D-34), the attachment
     policy and the fact that attached declarations take part in module dependencies (D-65), the
     `attached-files` signal (D-64), and `publicApi` from imports and re-exports (D-63).
   - 5.13 Declared modules (overlaps by name, D-23) and the requirement for the rules engine (D-73: the
     rules milestone writes docs/RULES.md).
   - 5.14 Unit kinds and their weighted and context signals (D-48).
6. **Layers.** Partition, pruning, the layer graph (type-only references always count at
   `type_only_weight`, D-51), exact order (the DP, D-52, citing Bodlaender, Fomin, Koster, Kratsch &
   Thilikos 2012 [ESTABLISHED]), greedy fallback (Eades, Lin & Smyth 1993), conventional tiers (D-53), rank
   semantics (classic and clean architecture), confidence, monorepos.
7. **Evidence and explanation.** Method strings and the parameters each covers (D-56); the total evidence
   order; the signal catalogue tables (modules, layers, roles); reason templates; how to verify a confidence
   by hand.
8. **Configuration reference.** Every key of `modules`, `layers` and `inference` (from `INFERENCE_KEYS`),
   with defaults, validation (D-67, D-69, D-71) and the method parameter it maps to.
9. **Complexity and scale.** The 4.7 table plus measured scale-test results.
10. **Results on the fixtures.** Generated from the goldens: per fixture, the modules (members, confidence),
    layers (rank, confidence) and every difference from the design's prototype numbers, with its cause (7.3:
    linker edges, singleton absorption, the monorepo cascade, utilities, attachments).
11. **References.** The design's §11 list plus Bodlaender et al. (2012). A placeholder line says: "Metrics are
    documented here from milestone 6."

### 8.2 docs/IR.md (U1 PR 1, then U5; review #14)

- **U1, PR 1 (with the derivation change): Identifiers.** Module keys: the root is `.` also with a stem
  (`mod:.#payment`); in the directory part `%`, `#` and `~` are written `%25`, `%23` and `%7E`, the
  encodings symbol identifiers use; stems are tokens with ASCII letters lower-cased (S-stemmed first
  tokens, or the fallback of D-34) and never contain `%`, `#`, `~` or `/`. Examples. Labelled as an
  identifier-derivation change made before the first release.
- **U5, after U4 lands: the semantic sections.**
  - **Architecture section.**
    - Which directories are components; component names for collapsed chains.
    - Module membership: nodes plus attached tests and declarations. Declarations, and tests counted in
      metrics, are attached only by strict majority and take part in aggregated module dependencies (D-65).
      Declared membership is exact on owned code roles.
    - "Modules may cut across directories and packages" becomes "Modules may cut across directories;
      declared modules may also span packages, inferred modules never do" (review #33). This agrees with the
      `ModuleEntity.packages` TSDoc and with the monorepo fixture README.
    - The anchor is the prior's directory.
    - The `entryPoints` and `publicApi` definitions (`publicApi` from `imports` and `re-exports`, D-63).
    - Layer rank semantics, declared versus inferred layers; layer ordering counts type-only references at
      `type_only_weight` even when the metrics exclude them (D-51).
    - Role sources.
  - **New subsection "Inference methods".** Lists `katedrala/module-inference@1` and
    `katedrala/layer-inference@1`, the `?parameters` grammar and which parameters each method covers
    (D-56), the meaning of `confidence` (weighted sum, not a probability), the wording rule (D-66), the
    `attached-files` signal (D-64), and the link to the signal catalogue.
  - **Pre-release changes note.** The meaning changes of 3.5 (`ModuleAnchor.directory` and `stem`,
    `ComponentEntity.name`, `ModuleEntity.packages`, the module key derivation) are listed as made before
    the first release, with `IR_SCHEMA_VERSION` kept at 1.0.0 (Q-8).
  - **Ordering table.** Add `FileEntity.roles`, `SymbolEntity.roles`: by role, then source; and
    `InferenceInfo.evidence`: the total order of 4.6 (review #34).

### 8.3 docs/ARCHITECTURE.md (U5)

- **Pipeline section.**
  - `analyzeArchitecture()` runs steps 1–4 plus inference (step 6).
  - The inference stage contributes roles to `files` and diagnostics, copy-on-write, so earlier sections are
    never mutated.
  - Add the stage list, and say that stages are inserted where their inputs require. Framework detection
    (step 5) will run before inference, because detector roles are layer votes; `ANALYSIS_STAGES` is not
    append-only (review #31).
- **ADR-007.** Replace "rounded to six decimals" with "rounded with `roundMetric` to nine significant digits
  (see IR.md)" (D-57).
- **New ADR-012, "Architectural inference: derived components, prior-anchored modules, layers by
  dependency order".**
  - Context: §3.2's experiments; ADR-006.
  - Decisions:
    - components are derived;
    - modules use prior-anchored refinement, not unconstrained clustering;
    - module identity comes from priors;
    - declared modules are exact and win;
    - rules target declared modules unless a rule opts in (M8 requirement; docs/RULES.md in M8, D-73);
    - layers come from role and directory votes, ranked by observed dependencies with an exact minimum
      feedback order for small cycles;
    - every heuristic carries evidence and a decomposable confidence, and its wording says it is inferred;
    - there is no randomness and no runtime-dependent text processing.
  - Consequences: TS/JS naming-culture bias, configurable vocabularies, uncalibrated weights.
- **New ADR-013, "Inference configuration is validated by the engine; inference takes resolved settings"**
  (scoped to inference; review #30).
  - Context: inference depends on ir, graph and model only, has no zod or picomatch, and is browser-capable
    (enforced by lint, 2.1).
  - Decision: the engine registers the validators of the `modules`, `layers` and `inference` sections,
    resolves globs with core's matcher, and passes typed settings and file lists. Validators never inject
    defaults (digest invariance), and no semantics depend on key order (D-23).
  - Consequence: M6–M8 decide for their own sections. The packages table's `@katedrala/rules — Rule
    configuration, selectors and evaluation` stays until M8 decides; this ADR does not prejudge it.
- **Packages table.** Unchanged for inference (ir, graph, model); add a note that the engine validates the
  inference configuration (ADR-013).

### 8.4 docs/ROADMAP.md, CONTRIBUTING.md, READMEs and the landing page

- **D-73 (docs/RULES.md deferred to M8; review #30).** The design targets `docs/RULES.md` for the interaction
  of rules with declared modules and layers. Rule semantics (selectors, `scope`, `include_inferred`) are the
  rules milestone's to define, and a RULES.md written now would document behavior that does not exist. M5
  records its one requirement (§3.14: module selectors and `scope: modules` mean declared modules unless a
  rule opts in) in ADR-012, ROADMAP M8 and ALGORITHMS.md 5.13; M8 writes docs/RULES.md.
- **ROADMAP (U5).**
  - M5 status: "In progress" when U1 PR 1 merges, then "Done" (coordinated with the landing page, below).
  - Under M7: the evidence signals anomalies consume, and `publicApi` against `entryPoints` for boundary
    bypass (D-63).
  - Under M8: "module selectors and `scope: modules` match declared modules unless `include_inferred: true`";
    docs/RULES.md (D-73).
  - Under M10: diff compares method strings and matches modules by similarity.
  - Under frameworks: detector roles feed layer votes, so detection runs before inference; symbol roles get
    decided.
  - Under M13: the index rebuild item (D-60) and the inference scale results (time and heap).
- **CONTRIBUTING (U5).** "Fixtures" section: golden sections and `KATEDRALA_UPDATE_GOLDEN=1`; a golden diff
  must be explained. "Standards": the [KATEDRALA HEURISTIC] label in TSDoc for inference code, the wording
  rule for heuristic conclusions (D-66), and the lint restrictions for the analysis packages (2.1).
- **fixtures/dependency-violations/README.md (U5).** The `moduleCycles` row reads "Cycles between declared
  modules (none). Inferred modules may form cycles; they are observations, not rule violations." (D-62).
- **Root README.md (U5; review #30).** "Get started" shows `analyzeArchitecture` alongside
  `analyzeStructure`, and the closing sentence "Inference, metrics, rules and the command line are on the
  roadmap" loses "Inference". The README has uncommitted working-tree changes (the "Get started" section
  itself); U5 builds on them and coordinates with their author.
- **Landing-page follow-up (outside M5, for the site owner; review #9).** M5 does not modify `site/`, and the
  site has uncommitted work in progress. Marking M5 "Done" makes these statements untrue:
  - `site/lib/site.ts`: `MILESTONES` lists "Architectural inference" as `planned`; the file says "as
    docs/ROADMAP.md lists them. Update both together". `site/components/sections/OpenSource.tsx` renders
    "4 of 15 milestones done" from it.
  - `site/components/sections/Architecture.tsx`: the lede "inferring the modules within it is planned for
    v1", the status label "Module inference, planned for v1" and the TSDoc line saying the same.
  - `site/components/sections/Pipeline.tsx`: the "Infer" pass has `status: "planned"` and future-tense text
    ("Components will be derived …; modules and layers will be inferred, each with a confidence and its
    evidence."), and the TSDoc says "Parse and Link run today, the rest are planned".
  - `site/components/sections/Ecosystem.tsx`: "Files, symbols and relationships today; modules and measures
    next."
  - `site/PRODUCT.md`: "Implemented today (milestones 1 to 4)" and "In development for v1 (milestones 5 to
    15): inference of components, modules and layers; …".

  Statements that remain true only because of D-64 and D-66: the Pipeline text "each with a confidence and
  its evidence", PRODUCT's "Inference is heuristic and says so", and README's "every inferred grouping
  carries a confidence and the observations behind it".

  Coordination: ROADMAP's "Done" for M5 merges together with the site owner's follow-up. If that cannot
  land in the same window, ROADMAP still says "Done" and the final M5 PR records the open follow-up with
  this list. The site then understates (it calls a shipped stage planned) and never overstates.

---

## 9. Risks and open questions

### 9.1 Risks

| # | Risk | Mitigation and recommended decision |
| --- | --- | --- |
| R-1 | The design's numbers come from prototype graphs (imports plus barrel resolution). The linker's symbol-level edges change pairs, weights, classes and, in rare cases, memberships. | Done for this revision: the linker-graph replay (7.3) turned every known difference into an explicit expectation: express conventional order, tangled utilities, high-fan-out orchestrators, singleton absorption, the monorepo cascade, attachments. U1 PR 2 re-runs it. Exact design values are asserted on prototype graphs, which now port barrel resolution and entry points (6.1), so the algorithm is verified independently of the linker. Goldens pin linker values after review, and ALGORITHMS.md §10 explains each difference. A fixture expectation changes only with a written justification. |
| R-2 | Class-name votes would have changed clean-architecture's layers. Other correlated signals could do the same. | D-14 (max within a source). It is the only reading consistent with the design's own numbers, and the replay reproduces §4.6 with it. U2 tests the clean-architecture case explicitly. |
| R-3 | Several thresholds sit exactly at fixture values: orchestrator condition (iii) at 50 % in high-fan-out, stem coverage at 0.50 (high-fan-in, fastify), and P5 ties such as `payment.service` in layered-architecture at 1.0 against 1.0. A type-only edge or an extra symbol edge can flip them. | Strict inequalities as specified, decided exactly (D-67). Tests at the boundaries. High-fan-out is confirmed on the linker graph (both files are composition roots), so the assertion is written now. Perturbation tests report the observed sensitivity. |
| R-4 | Performance: three model builds, projection allocation, and 10^6 edges in a test process. | `forEachUnderlyingEdge` (no allocation); typed arrays; the opt-in full-size test; D-60 recorded for M13. |
| R-5 | Vocabulary bias: TS/JS naming conventions; feature names that collide with generic tokens (`event`, `message`); non-ASCII names are not case-folded (D-05). | Everything is configurable (`!` removals, `null` in maps), with normalization (D-69). Evidence names the vocabulary entry used. ALGORITHMS.md lists the defaults and repeats §1.4's limitation. |
| R-6 | Stability is non-local: P2 connectivity, P3 classes, the P1 size cap, and condition-4 cascades (D-74). | Measured by the three perturbation kinds (7.1) and published. Classes are reported as evidence. Ids never depend on membership. Diff (M10) pairs modules by similarity. |
| R-7 | Golden churn on every algorithm change, and silent changes from dependencies. | Goldens cover the architecture sections only; there is an update script and the review rule. A method version bump (`@2`) is required whenever an algorithm change changes outputs at default settings (ALGORITHMS.md). Louvain's parameters are pinned in inference (D-68). |
| R-8 | The M8 rules engine must treat module selectors as declared-only by default, or dependency-violations' `no-module-cycles` breaks (inferred `customers ↔ orders` cycle). | Recorded in ADR-012, ROADMAP M8 and the fixture README (D-62); docs/RULES.md in M8 (D-73). The inference test asserts that the inferred cycle exists, so the requirement cannot be forgotten. |
| R-9 | The analysis digest could miss inference inputs: validators that inject defaults, or semantics that depend on key order. | D-61 (no defaults in schemas) and D-23 (no key-order semantics). U5 tests: equal digests with and without the validators; reordered overlapping modules give identical documents. |
| R-10 | Heuristic conclusions read as facts (truth table, README, PRODUCT). | D-66 wording, D-64 attachment evidence, template snapshot tests, the InferenceInfo property ("Inferred:" reasons). |
| R-11 | The landing page states that inference is planned (8.4). | The follow-up list for the site owner; ROADMAP's "Done" is coordinated with it. |
| R-12 | The replay is a scratch approximation; production code may differ from it, or from this plan. | A difference between production and replay is investigated as a bug in one of them before goldens are committed (7.3); U1 PR 2 re-runs the replay on merged helpers. |

### 9.2 Open questions, with a recommended decision for each

| # | Question | Recommendation |
| --- | --- | --- |
| Q-1 | Should the module kind become an IR field (`ModuleAnchor.kind`) instead of a context evidence signal (D-48)? | Not in M5. Evidence keeps the IR unchanged and is explicit enough for M7 and the tests. Revisit when CodeVerse (M14) needs it. It would be an additive minor change. |
| Q-2 | Should validators live in `@katedrala/inference`, as the design says, or in the engine (D-59, ADR-013)? | In the engine. Inference stays dependency-light and browser-capable (lint-enforced), and ADR-013 is scoped to inference so that M6–M8 decide for themselves. |
| Q-3 | Should votes combine by noisy-OR over all votes (design text) or max within a source (D-14)? | Max within a source, for the reasons given in D-14. |
| Q-4 | Should layers require at least one observed cross-layer dependency? Unrelated monorepo packages give rank-0 layers with confidence about 0.3 (D-55). | Keep the design: low confidence is honest, and conventional arcs serve single-package apps whose layers are not connected by observed paths. Revisit with real repositories in M13. |
| Q-5 | Should new diagnostic codes `module-overlap` and `layer-overlap` be added, or `configuration-warning` reused (D-24)? | Reuse `configuration-warning` with a fixed message prefix. Add the codes in a minor IR version if CI users ask for them. |
| Q-6 | Can loose files of a split non-container directory become a pinned shared unit (D-25)? | No. They keep the directory's kind. |
| Q-7 | How should `moduleCycles` in dependency-violations be interpreted (D-62)? | Declared modules only, with a README clarification. Asserting "no cycle among all modules" contradicts §3.14. |
| Q-8 | Should `IR_SCHEMA_VERSION` be bumped for the pre-release meaning changes and the module key derivation (3.5)? | No. Pre-release precedent (M2–M4 changed the IR at 1.0.0), and no document with components, modules or layers exists yet. IR.md lists the changes in a pre-release note. Freeze 1.0.0 at the first release (M15). |
| Q-9 | Should tests be attachable to declared modules? | No (D-65). Declared membership is exact; a user who wants tests in a declared module adds a glob. |
| Q-10 | Should weights and confidences be configurable? | No. They are part of the method (`@1`). Configurable weights would make confidences incomparable across repositories. Calibration is a post-v1 research item. |
| Q-11 | Should condition 4's lone-file exception apply to singleton *prior* units only, which would prevent cascades such as monorepo's `catalog` (D-74)? | No, keep the design's current-size rule. The alternative keeps a one-file module with confidence 0.15 and a cycle, which explains less, and every cascaded move is a strict majority reported as evidence. Revisit with real repositories (M13), using the perturbation measurements. |
| Q-12 | Should `type_only_weight` be restricted to multiples of 1/1024 (D-67), or quantized silently? | Restrict, with a validation message that names allowed values. Exact sums keep ties and the DP property reliable, and silent quantization would make the method string report a value the user did not write. |
| Q-13 | Should overlapping declared modules resolve by name (D-23) or by configuration order, with the order added to `analysisDigest` and integer-like module names rejected? | By name. Configuration meaning then equals its canonical JSON, a key-sorting formatter changes nothing, and overlaps are warnings users fix anyway. |
