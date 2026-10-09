# Katedrala architecture

This document describes how Katedrala is built and why. It is the reference for contributors and for anyone
evaluating whether Katedrala's conclusions can be trusted.

- [Principles](#principles)
- [System overview](#system-overview)
- [Packages](#packages)
- [The analysis pipeline](#the-analysis-pipeline)
- [Truth levels: observed, derived, inferred](#truth-levels-observed-derived-inferred)
- [Decision records](#decision-records)
- [Performance strategy](#performance-strategy)
- [Extension points](#extension-points)
- [Non-goals](#non-goals)

## Principles

1. **Deterministic core.** The same inputs (files, configuration, Katedrala version) always produce the same
   output, byte for byte. No randomness, no wall-clock dependence, no network, no LLM in the analysis path.
2. **Explainable conclusions.** Every relationship has provenance (where in the code it was observed). Every
   inferred grouping has confidence, evidence and a method identifier. Every aggregate score is decomposable
   into weighted terms whose raw values are reported.
3. **Honest about uncertainty.** Directly observed facts (an import statement) and heuristic conclusions (these
   18 files form a "payments" module) are kept distinct in the data model and in the wording of every report.
   Katedrala reports anomalies and risks; it never declares code "bad".
4. **A primitive, not a product.** The engine is a library with a stable, versioned JSON contract. The CLI,
   the CodeVerse adapter and future integrations (editors, pull-request bots) are consumers of that contract.
5. **Language-agnostic core.** Only language adapters know about a programming language. Everything after
   extraction works on a normalized intermediate representation (IR).

## System overview

```text
                 ┌───────────────────────────────────────────┐
  consumers      │  katedrala (CLI)   @katedrala/codeverse    │   human output, JSON/YAML, exports
                 └───────────────────────┬───────────────────┘
                 ┌───────────────────────▼───────────────────┐
  public API     │  @katedrala/engine                         │   analyze · impact · diff · validate ·
                 │                                            │   explain · health · history
                 └───────────────────────┬───────────────────┘
                 ┌───────────────────────▼───────────────────┐
  analysis       │  inference · metrics · anomalies · rules · │   all operate on the IR through
                 │  impact · diff                             │   @katedrala/model (indexes + graph
                 └───────────────────────┬───────────────────┘   projections)
                 ┌───────────────────────▼───────────────────┐
  IR             │  @katedrala/ir  (types, ids, JSON Schema)  │   the contract
                 └───────────────────────▲───────────────────┘
                 ┌───────────────────────┴───────────────────┐
  extraction     │  @katedrala/core: discovery → extraction → │   cache, worker pool
                 │  project setup;  @katedrala/linker         │   resolution, binding
                 └───────▲───────────────▲──────────▲────────┘
                 ┌───────┴──────┐ ┌──────┴──────┐ ┌─┴─────────────┐
  plugins        │ language     │ │ framework   │ │ snapshot      │   @katedrala/plugin-api contracts
                 │ adapters     │ │ detectors   │ │ sources       │
                 │ (TS/JS, ...) │ │ (Express..) │ │ (fs, git)     │
                 └──────────────┘ └─────────────┘ └───────────────┘
```

## Packages

| Package                         | Responsibility                                                                                                         | Depends on                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `@katedrala/ir`                 | IR types, stable identifiers, canonical ordering/serialization, document index, JSON Schemas                           | —                         |
| `@katedrala/graph`              | Compact directed (multi)graphs and standard algorithms (SCC, reachability, centrality, PageRank, clustering)           | —                         |
| `@katedrala/plugin-api`         | Contracts: language adapters, snapshot sources, framework detectors, exporters, metric/anomaly/rule plugins            | ir                        |
| `@katedrala/model`              | In-memory architecture model: entity indexes and graph projections at symbol/file/component/module/layer/package level | ir, graph                 |
| `@katedrala/core`               | Configuration, snapshot sources, file discovery and classification, extraction (cache, workers), project preparation   | ir, plugin-api            |
| `@katedrala/linker`             | Module resolution and cross-file binding: files, symbols, typed edges with provenance, packages, externals             | ir, plugin-api            |
| `@katedrala/adapter-typescript` | TypeScript and JavaScript adapter (TypeScript compiler API), tsconfig/package.json-aware module resolution             | ir, plugin-api            |
| `@katedrala/frameworks`         | Framework detectors (Express, NestJS, Fastify)                                                                         | ir, plugin-api            |
| `@katedrala/git`                | Git snapshot sources (commits without checkout), history sampling                                                      | ir, plugin-api            |
| `@katedrala/inference`          | Components, modules and layers                                                                                         | ir, graph, model          |
| `@katedrala/metrics`            | Established metrics plus Architectural Gravity and Architectural Entropy                                               | ir, graph, model          |
| `@katedrala/anomalies`          | Deterministic anomaly detection                                                                                        | ir, graph, model, metrics |
| `@katedrala/rules`              | Rule configuration, selectors and evaluation                                                                           | ir, graph, model          |
| `@katedrala/impact`             | Change impact (blast radius) with explanation paths                                                                    | ir, graph, model          |
| `@katedrala/diff`               | Comparison of two documents                                                                                            | ir, model                 |
| `@katedrala/engine`             | Orchestration and the public programmatic API                                                                          | all of the above          |
| `katedrala`                     | Command-line interface (re-exports the engine API)                                                                     | engine                    |
| `@katedrala/codeverse`          | Converts documents into a visualization model for CodeVerse                                                            | ir                        |

Packages are introduced milestone by milestone (see [ROADMAP.md](ROADMAP.md)); the table describes the target.
`@katedrala/inference` is a pure library over the IR and the model: the engine validates the `modules`,
`layers` and `inference` configuration sections and resolves their globs before calling it (ADR-013).

**Dependency rules.** Package dependencies form a directed acyclic graph that points downward in the overview.
Plugins depend only on `plugin-api` and `ir`. `ir` and `graph` have no dependencies. `@katedrala/codeverse`
depends only on `ir`: it consumes documents and never runs analysis. Katedrala validates these rules on its
own source code with its own rule engine.

## The analysis pipeline

```text
SnapshotSource ──list()──► discovery ──► extraction ──► project setup ──► linking ──► framework detection
(working tree,             (include/      (per file,     (per adapter:     (resolve      (roles, routes,
 git revision)              exclude,       parallel,      manifests,        imports,      DI, externals)
                            roles)         cached)        resolvers)        bind refs)
                                                                               │
          structural document: directories, packages, files, symbols, externals, edges
                                                                               │
          ┌────────────────────────────┬───────────────────┬──────────────────┤
          ▼                            ▼                   ▼                  ▼
      inference                     metrics            anomalies            rules
  (components, modules,       (coupling, cycles,    (cycles, hubs,      (forbidden/allowed
   layers + evidence)         centrality, gravity,   god components,     deps, layers,
                              entropy)               boundary bypass…)   cycles, fan-out…)
          └────────────────────────────┴───────────────────┴──────────────────┘
                                                │
                                   canonical ArchitectureDocument
                                                │
                     impact · diff · health · explain · validate · history · exporters
```

1. **Discovery.** The snapshot source lists files (honouring `.gitignore`). The configuration is read from
   the snapshot itself (the first of `katedrala.config.yaml`, `.yml`, `.json`, `.katedrala.yaml`, `.yml` at its
   root), so a git revision is analyzed with the configuration it contained. Configuration `include`/`exclude`
   globs narrow the set; each file gets a role (`source`, `test`, `declaration`, `configuration`, ...).
   Reserved configuration sections whose stage is not installed are accepted, not evaluated, and reported with
   a `configuration-warning`.
2. **Extraction.** For each file an adapter claims, the file is parsed and reduced to a language-neutral
   `FileExtraction`: declarations, imports, exports, unresolved references (with local binding information)
   and facts (environment reads, HTTP calls). Extraction depends only on the file's content and dialect, so
   results are cached by content hash and computed in parallel worker threads.
3. **Project setup.** Each adapter reads project configuration (e.g. `package.json`, `tsconfig.json`) and
   returns package descriptors and a module resolver for the snapshot.
4. **Linking.** The linker resolves import specifiers to files or external entities, follows imports and
   re-export chains to declarations, binds references (including members reached through declared types,
   `new` expressions and declared return types) and aggregates observations into typed edges with provenance.
   References that cannot be bound are counted in `repository.stats`: `unresolvedReferences` when a binding
   should exist but does not, `untypedReferences` when the referenced value's type cannot be known without a
   type checker (for example a member of the result of a function that declares no return type).
5. **Framework detection.** Detectors add roles (controller, service, repository, route, ...), edges
   (e.g. dependency injection) and external integrations.
6. **Inference, metrics, anomalies, rules.** Each stage reads the model and contributes its sections of the
   document. Stages never mutate earlier sections. Inference (milestone 5) contributes `components`,
   `modules` and `layers`, the inferred roles of `files` and its diagnostics; it merges the roles into
   `files` copy-on-write, so the structural sections it read are never changed.
7. **Canonicalization.** All arrays are put in canonical order and real values are rounded, so documents are
   byte-identical across runs and machines.

`@katedrala/engine` runs steps 1–4 as `analyzeStructure()`: it returns the observed structure (the structural
sections of the document, already canonical), an `ArchitectureModel` over it for projections and graph
algorithms, and run information (timings, cache hits, workers) that is kept out of the document. The repository
is identified by its `origin` remote or its configured or declared name, never by the checkout directory, and
`snapshot` records the content, analysis and project-configuration digests. The later stages build on this
result.

`analyzeArchitecture()` runs steps 1–4 and then inference (step 6). It registers the validators of the
`modules`, `layers` and `inference` configuration sections (ADR-013), so its analysis digest equals
`analyzeStructure()`'s; resolves the inference settings and the declared modules, layers and roles; runs
`inferArchitecture()` on the structure's model with the metrics projection; merges the inferred roles and
diagnostics; and returns the structural sections plus `components`, `modules` and `layers`, with a model over
the final document. The sections of later milestones (`metrics`, `anomalies`, `violations`, `rules`,
`endpoints`) are absent rather than empty, so that nothing reads as a measurement that was not made.

The engine reports its stages through `onProgress` and times them in `run.timings`. `ANALYSIS_STAGES` lists
them in execution order: `listing`, `configuration`, `discovery`, `extraction`, `projects`, `linking`,
`inference`. `analyzeStructure` runs the stages up to `linking`. Later milestones insert their stages where
their inputs require: framework detection runs before `inference`, because detector roles are layer votes;
metrics, anomalies and rules run after it. The list is therefore not append-only: look stages up by name,
never by position.

The end-to-end tests in `tests/fixtures/` run `analyzeArchitecture()` on every fixture: `structure.test.ts`
compares the result with the fixture's ground truth, and `inference.test.ts` checks the inferred sections
against the milestone 5 expectations and the committed golden sections (`tests/fixtures/golden/`).

## Truth levels: observed, derived, inferred

| Level        | Examples                                                                       | How it is represented                                                   |
| ------------ | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| **Observed** | files, symbols, imports, calls, manifest dependencies                          | entities and edges with `provenance` (file, line, column, mechanism)    |
| **Derived**  | components (from directories/packages), aggregated dependencies, metrics, SCCs | deterministic functions of observed data; documented formulas           |
| **Inferred** | modules, layers, structural roles, anomalies                                   | `confidence`, `evidence`, `reason`, `method`; wording states "inferred" |

Even observed relationships can be uncertain when resolution is heuristic (for example a method call resolved
through a declared type). Each observation therefore carries its own `confidence` and `resolution` method.

## Decision records

### ADR-001 — TypeScript on Node.js; TypeScript 6.0 compiler API as the TS/JS parser

- **Context.** The first languages are TypeScript and JavaScript; the main consumer (CodeVerse) is a TypeScript
  application; the CLI should install with npm anywhere. As of October 2026 `typescript@latest` is 7.x, the
  native (Go) compiler whose JavaScript API is only available as `typescript/unstable/*` over IPC.
  TypeScript 6.0 is the last release line with the stable in-process compiler API, and typescript-eslint
  supports TypeScript `< 6.1`.
- **Decision.** Katedrala is written in strict TypeScript, runs on Node.js ≥ 22.12 and is distributed as ESM
  packages. The TS/JS adapter uses the TypeScript 6.0 compiler API (`createSourceFile`) — the reference
  grammar for TypeScript, pure JavaScript (no native binaries), extremely error tolerant, and able to parse
  JavaScript, JSX, TSX, declaration files and `tsconfig.json` (including `extends`).
- **Consequences.** Parsing throughput is that of a JavaScript parser (mitigated by worker threads and
  caching). New syntax introduced after TypeScript 6.0 is not understood until the adapter migrates. The parser
  is isolated behind the `LanguageAdapter` contract, so a faster parser (oxc) or the TypeScript 7 API can
  replace it without touching the rest of the engine.

### ADR-002 — Context-free per-file extraction, project-level linking

- **Decision.** Adapters produce a `FileExtraction` from a single file's content. Cross-file knowledge (module
  resolution, following imports to declarations, member resolution through types) is the linker's job and
  runs on the whole snapshot.
- **Why.** Extraction dominates the cost of analysis. Making it a pure function of content enables a
  content-addressed cache that survives across runs, branches and commits: analyzing `HEAD~1` after `HEAD`
  re-parses only the files that differ. It also makes extraction trivially parallel.
- **Consequences.** Adapters must record enough local binding information (which import a name refers to,
  the declared type of a property) for the linker to resolve references without re-reading files. Languages
  whose name resolution depends on other files of the same package (Go, Java) report unqualified references
  and let their project-level resolver complete them.

### ADR-003 — Snapshot sources

- **Decision.** The engine reads files only through a `SnapshotSource` (`list`, `read`, `revision`). The
  working-tree source walks the file system honouring `.gitignore` (using `git ls-files` when available); the
  git source reads a revision's tree and blobs directly with git plumbing commands, without a checkout.
- **Why.** `katedrala diff HEAD~1 HEAD` and `katedrala history` must not touch the user's working tree, and
  must be fast. Git blob ids double as content identities for the extraction cache.

### ADR-004 — Stable, readable identifiers

- **Decision.** Identifiers are derived from what an entity _is_: `file:<path>`,
  `sym:<path>#<qualified name>`, `pkg:<ecosystem>:<manifest directory>`, `mod:<anchor>`, ... Line numbers,
  declaration order and checkout locations never appear in identifiers: when declarations share a qualified
  name, a fixed kind precedence (not source order) decides which gets the bare identifier. Edge, endpoint,
  anomaly and violation identifiers are 64-bit SHA-256 prefixes of their defining parts. The exact rules are
  normative and specified in [IR.md](IR.md).
- **Why.** Diffs, history, caching and external consumers all need to recognize the same entity across
  snapshots. Inserting a line, reordering declarations or cloning into another directory must not change the
  identity of anything.
- **Trade-off.** A rename or a move changes identity. Diffs therefore match entities before comparing them
  (identical content digests and version-control rename detection for files, member similarity for modules)
  and report renames explicitly instead of as removals plus additions.

### ADR-004b — The IR evolves additively, consumers read tolerantly

- **Decision.** Minor schema versions may add fields, enumeration values and union branches. Consumers must
  ignore what they do not know. Two JSON Schemas are published per document kind: a tolerant consumer schema
  identified per major version, and a strict producer schema for exactly one version.
- **Why.** New languages (Go, Java, Rust, C#), frameworks and metrics will add vocabulary. Without tolerant
  reading, every addition would break every validating consumer.

### ADR-005 — A typed multigraph in the IR, compact projections for algorithms

- **Decision.** The IR stores every relationship kind separately with provenance (`A imports B` and `A calls B`
  are distinct edges). Algorithms run on immutable compressed-sparse-row projections (`Int32Array` adjacency)
  built for a chosen level (symbol, file, component, module) and a chosen set of edge kinds.
- **Algorithms.** Standard algorithms are implemented in `@katedrala/graph` against the compact
  representation rather than taken from a general-purpose graph library: determinism (fixed iteration and
  tie-breaking orders), memory footprint on large repositories and control over approximations matter more
  than avoiding a few hundred lines of well-known code. Correctness is established by property-based tests
  against brute-force reference implementations and against an established library (graphology) used as a
  test oracle only.

### ADR-006 — Components, modules and layers are different views

- **Components** are physical: workspace packages and source directories, arranged as a tree. They are
  derived deterministically from declared structure.
- **Modules** are logical groupings inferred from dependency structure, naming and location, and may cut
  across directories (a "payments" feature spread over `controllers/`, `services/` and `repositories/`).
  Configuration can declare modules explicitly; declared modules take precedence.
- **Layers** are horizontal roles (controller, service, repository, ...) with an expected dependency direction.
- **Why.** "Directory = module" is the most common and most misleading simplification in architecture
  tooling. Keeping the physical and logical views separate lets Katedrala show where they disagree.

### ADR-007 — Determinism is part of the contract

- Arrays are sorted canonically; real-valued measurements are rounded with `roundMetric` to nine significant
  digits (see [IR.md](IR.md)); iteration over maps follows sorted keys where order matters; approximations
  (sampled betweenness) use fixed seeds.
- Volatile information (timings, timestamps, cache statistics) lives in an optional `run` section that is
  excluded from serialization by default.
- Golden-output tests run the full pipeline on fixture repositories and compare against committed documents.

### ADR-008 — No LLM in the core

The analysis engine is deterministic, testable and reproducible. Natural-language interpretation can be added
later as an optional layer _on top of_ the JSON contract; it will never feed back into analysis results.

### ADR-009 — The JSON Schema is generated from the TypeScript types

The IR's TypeScript types (with TSDoc) are the single source of truth. `pnpm schema` generates JSON Schemas
(draft 2020-12) for every document kind into `packages/ir/schema`; CI fails if they are stale. Identifier
patterns and extensible enumerations (`x-` values reserved for plugins) are expressed precisely. The schema
version is independent of the Katedrala version (see [IR.md](IR.md)).

### ADR-010 — Naming conventions

JSON fields are camelCase (native to the TypeScript API and to consumers such as CodeVerse); enumeration
values are kebab-case; configuration files (`katedrala.config.yaml`) use snake_case keys, as is customary
for YAML configuration.

### ADR-011 — Nesting limits: the same extraction in every thread

- **Decision.** The TypeScript/JavaScript adapter measures the nesting of every parsed file before binding
  it, with a walk that keeps its own stack: each edge of the syntax tree weighs about the stack TypeScript's
  parser (respectively binder) uses to descend it, in units of about 0.3 KB, and the heaviest path from the
  root is the file's nesting. Beyond the limit for binding (1,000 units) the file is extracted without scopes
  (`partial`, with a diagnostic that says so). Beyond the limit for parsing (1,000 units) the file is not
  analyzed (`failed`, reason "the file is nested beyond the limit for parsing"), whether or not the parser
  managed to read it. A parse that exhausts the stack only happens beyond that limit and ends the same way;
  TypeScript's parser state is cleared after it, so that it cannot change how the next file is parsed.
- **Why.** TypeScript's parser and binder recurse along the tree, and the stack differs between threads:
  984 KB on the main thread, 4 MB in a worker thread (Node.js defaults), and per level it also varies with
  the Node.js version and with what the JIT has optimized. Without limits, a file with a 700-link call chain
  was bound in a worker but not in the main thread, and a file with 600 levels of nested type arguments
  parsed in a worker but not in the main thread: the document depended on the worker count (a 2-vCPU
  machine parses in the main thread) and on the batch a file landed in. Determinism is part of the contract
  (ADR-007).
- **Margins.** The weights were measured per construct (76 constructs, cold JIT, Node.js 22 and 25);
  constructs not measured get the heaviest weight. At the limits, parsing, binding and extraction need at
  most 328 KB of stack, a margin of 3.0 or more on the main thread and of 12 or more in a worker thread.
  Within the limits: 200 `||` operands, 166 links of a call chain, 125 levels of nested arrays, call
  arguments or type arguments, 500 levels of `? :`, 1,000 `else if` branches (500 of them bound); chains the
  parser and the binder iterate over (`+`, `,`, and member accesses for the parser) cost nothing. The weights
  and measurements are in `packages/adapter-typescript/src/extract/nesting.ts`.
- **Residual risk.** Two cases are not covered:
  1. _Discarded speculative parses._ The measure sees the tree the parser builds. TypeScript's parser also
     tries readings it discards when they fail: in TypeScript files, type arguments after `<` (`f<T>(x)`),
     arrow-function parameters after an ambiguous `(`, and a few lookaheads in type positions. Chains of `<`
     comparisons are weighed for the first. Otherwise, a file constructed so that a discarded attempt nests
     far deeper than the final tree (for example thousands of chained `keyof` operators or conditional types
     inside parentheses that turn out not to hold an arrow function's parameters) can still exhaust the
     parser's stack in the main thread and not in a worker, and so be `failed` in one and analyzed in the
     other. Neither people nor common code generators write such code.
  2. _Other runtimes and settings._ The weights are measurements of TypeScript 6.0.3 on the V8 of Node.js 22
     and 25 (x64). A runtime with much larger stack frames, or a main-thread stack reduced with
     `--stack-size` (or `NODE_OPTIONS`) below about a third of the default, could still exhaust the stack
     within the limits. Last-resort fallbacks keep the analysis going (a binder failure, or a stack overflow
     during name resolution, extracts the file without scopes and reports the error), but their outcome
     depends on the thread again.

### ADR-012 — Architectural inference: derived components, prior-anchored modules, layers by dependency order

- **Context.** ADR-006 separates components, modules and layers. The milestone 5 design measured the
  alternatives on the fixtures ([ALGORITHMS.md](ALGORITHMS.md#modules)): unconstrained modularity clustering (Louvain, γ = 1) scrambles intentional structure (it mixes
  clean-architecture's layers into dependency-dense groups and cuts every feature of a tangled repository
  into pieces of other features) and is unstable under single-edge changes, as Wu, Hassan and Holt (2005)
  observed for clustering-based recovery. Directories and file names are the strongest available statement
  of the developers' intent, and pattern-based recovery (ACDC) did comparatively well in the comparative
  studies.
- **Decisions.**
  - **Components are derived**, never inferred: package roots, directories that contain code, branch points
    and the analysis root, by rules with no thresholds.
  - **Modules use prior-anchored refinement**, not unconstrained clustering: directories and recurring
    file-name stems form the prior; dependency evidence overrides it file by file, only on a strict majority
    with minimum support; Louvain only splits directories too large and too flat to be one module, warm
    started from file-name stems and with pinned parameters.
  - **Module identity comes from the prior** (`mod:<anchor directory>[#<stem>]`), never from final
    membership, so files moving in or out never rename a module.
  - **Declared modules are exact and win**: their files are never inferred, and overlaps resolve by name.
  - **Rules target declared modules unless a rule opts in.** Inferred modules may form cycles (an observation,
    not a violation): module selectors and `scope: modules` match declared modules unless
    `include_inferred: true`. This is the one requirement milestone 5 records for the rules milestone
    (milestone 8), which writes `docs/RULES.md`.
  - **Layers come from role and directory votes**, ranked by the observed dependencies between them: an exact
    minimum-feedback order for strongly connected sets of up to 12 layers (the subset dynamic programme of
    Bodlaender et al. 2012), a greedy order beyond, and conventional tiers only for layers no observed path
    orders.
  - **Every heuristic carries evidence and a decomposable confidence** (`confidence = Σ weight × value`), a
    method string with its non-default parameters, and wording that says it is inferred ("Inferred: …",
    "(Katedrala heuristic)").
  - **No randomness and no runtime-dependent text processing**: ASCII-only lexing (no Unicode tables, no
    locale), exact dyadic weight arithmetic, deterministic tie-breaking.
- **Consequences.** The vocabularies (directory names, naming suffixes, generic tokens) encode TypeScript and
  JavaScript naming culture; they are configurable, and the defaults are listed in ALGORITHMS.md. The signal
  weights are design choices, not calibrated against a ground-truth corpus; they are part of the method
  version, so confidences stay comparable across repositories. Stability is measured, not assumed:
  ALGORITHMS.md publishes the perturbation measurements and analyses every case above the bound.

### ADR-013 — Inference configuration is validated by the engine; inference takes resolved settings

- **Context.** `@katedrala/inference` depends on `ir`, `graph` and `model` only, has no `zod` and no
  `picomatch`, and runs in any JavaScript environment. Lint enforces this for its sources (no Node.js
  modules or globals, no other workspace package, nothing that reads the clock, randomness or the locale).
- **Decision.** The engine registers the validators of the `modules`, `layers` and `inference` sections,
  resolves their globs with core's path matcher and passes typed settings and file lists
  (`resolveInferenceSettings`, `Declarations`). Validators never inject defaults, so the canonical
  configuration JSON, and the analysis digest computed from it, are the same with and without them; and no
  inference semantics depend on the order of configuration keys (overlapping declared modules resolve by
  name).
- **Consequences.** The scope is inference: milestones 6–8 decide for their own sections. The packages
  table's `@katedrala/rules — Rule configuration, selectors and evaluation` stays until milestone 8 decides;
  this ADR does not prejudge it.

## Performance strategy

Measure first; optimize what measurements show. The design leaves room for:

- **Content-addressed extraction cache** (per file, keyed by content digest, dialect, adapter id/version and
  options) — the dominant saving for repeated and historical analyses.
- **Parallel parsing** in worker threads for large snapshots; in-process for small ones (worker start-up
  costs more than it saves below a few hundred files).
- **Compact graphs**: integer-indexed CSR adjacency in typed arrays; projections computed once and memoized.
- **Bounded algorithms**: exact betweenness up to a size threshold, then deterministic sampling (documented,
  reported as an `approximation-used` diagnostic).
- **Streaming where it matters**: git blobs are read through one long-lived `git cat-file --batch` process.

Benchmarks (`benchmarks/`) track files per second, wall time per stage, peak memory and graph size on
synthetic repositories of increasing size and on real open-source repositories.

## Extension points

All extension contracts live in `@katedrala/plugin-api` and are documented in
[LANGUAGE_ADAPTERS.md](LANGUAGE_ADAPTERS.md) and [API.md](API.md):

| Extension          | Contract            | Purpose                                                    |
| ------------------ | ------------------- | ---------------------------------------------------------- |
| Language adapter   | `LanguageAdapter`   | Parse a language and extract language-neutral facts        |
| Snapshot source    | `SnapshotSource`    | Provide files from a new kind of storage                   |
| Framework detector | `FrameworkDetector` | Recognize framework roles, routes, injection, integrations |
| Graph exporter     | `GraphExporter`     | Export documents to other formats                          |
| Metric provider    | `MetricProvider`    | Add per-unit measurements (reported under `extensions`)    |
| Anomaly detector   | `AnomalyDetector`   | Add anomaly types (`x-` prefixed)                          |
| Rule evaluator     | `RuleEvaluator`     | Add rule types (`x-` prefixed)                             |

## Non-goals

- Katedrala does not execute, build or install the code it analyzes.
- It is not a linter for code style or a type checker; it reasons about structure.
- It does not upload source code anywhere; there is no hosted component.
- It does not attempt whole-program type inference in v1; member calls on values of unknown type are not
  resolved (and are counted, not guessed).
