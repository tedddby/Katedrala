# Roadmap

Katedrala is built in milestones. Each milestone ends with passing tests, lint, type checking, a manual
inspection of real output and updated documentation; later milestones never build on broken foundations.

## v1 milestones

| #   | Milestone                             | Scope                                                                                                          | Status      |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Foundation, architecture, IR          | Monorepo tooling, CI, IR types, stable identifiers, canonical serialization, JSON Schemas, plugin contracts    | Done        |
| 2   | TypeScript/JavaScript parsing         | TS/JS adapter (TypeScript 6 compiler API), extraction of symbols, imports, exports, references, facts          | Done        |
| 3   | Dependency graph                      | Discovery, module resolution (tsconfig paths, workspaces, package exports), linking, typed edges, provenance   | Done        |
| 4   | Graph algorithms                      | CSR graphs, SCC, cycles, reachability, shortest paths, depth, centrality, PageRank, clustering                 | Done        |
| 5   | Architectural inference               | Components, roles, modules (prior-anchored refinement), layers, confidence and evidence                        | Done        |
| 6   | Metrics                               | Martin metrics, propagation cost, Lakos CCD, core–periphery roles, Architectural Gravity, Entropy              | Planned     |
| 7   | Anomaly detection                     | Cycles, god components, hubs, boundary bypass, upward/unstable dependencies, coupled clusters, orphans         | Planned     |
| 8   | Rules engine                          | Configuration schema, selectors, forbidden/allowed dependencies, layers, isolation, direction, fan-out, cycles | Planned     |
| 9   | Impact analysis                       | Blast radius with explanation paths, affected modules, tests and integrations, risk factors                    | Planned     |
| 10  | Architecture diff                     | Document comparison: modules, dependencies, cycles, entropy, gravity, violations                               | Planned     |
| 11  | CLI                                   | All commands, human/JSON/YAML output, exit codes, `--quiet/--verbose/--no-color`                               | Planned     |
| 12  | Git and CI integration                | Git snapshot sources, `diff <rev> <rev>`, `history`, `validate --fail-on`                                      | Planned     |
| 13  | Performance and caching               | Content-addressed cache, worker pool, benchmarks                                                               | In progress |
| 14  | CodeVerse adapter                     | `@katedrala/codeverse` visualization model                                                                     | Planned     |
| 15  | Documentation and release preparation | Complete documentation, examples, release process                                                              | Planned     |

Framework awareness (Express, NestJS, Fastify) is developed alongside milestones 7–12, once the core engine
is stable.

## Notes for later milestones

Milestone 5 (architectural inference, [ALGORITHMS.md](ALGORITHMS.md)) leaves these requirements and results
for the milestones that build on it:

- **Metrics (6).** Write `ArchitectureAnalysis.projection` (the metrics projection aggregated dependencies were
  computed on) to `metrics.projection`, and reuse the units model of `inferArchitecture` for unit-level
  projections.
- **Anomalies (7).** Build anomalies from the inference evidence, whose signal ids are stable:
  `upward-dependencies` (layers), `relocated-files` (misplaced files), `single-user-files` (grab-bag shared
  directories), and `publicApi` against `entryPoints` for boundary bypass (`publicApi` comes from `imports`
  and `re-exports` edges only, so a deep import shows as a member of `publicApi` that is not an entry point).
- **Rules (8).** Module selectors and `scope: modules` match declared modules unless a rule sets
  `include_inferred: true`: inferred modules may form cycles (dependency-violations' `customers ↔ orders`),
  and rule violations must not depend on heuristics. Milestone 8 writes `docs/RULES.md` (rule semantics,
  declared modules and layers in rules).
- **Diff (10).** Compare `InferenceInfo.method` strings first (inferences with different parameters are not
  comparable), and match modules across snapshots by member similarity: module ids derive from priors and
  survive files moving in or out, but a renamed directory or a stem that appears or disappears renames them.
- **Frameworks.** Detector roles are layer votes, so framework detection runs before the `inference` stage;
  decide whether detectors put roles on files or on classes (`SymbolEntity.roles` has no producer yet).
- **Performance (13).** Reuse the structural document index instead of building the model three times (the
  structure model, inference's units model, the final document's model). Inference scale results, measured
  once on a 4-vCPU Linux cloud machine (Intel Xeon at 2.1 GHz, Node.js 22.22; not comparable with other
  machines; heap without forced garbage collection): 48 000 files and 480 000 edges, `inferArchitecture` 9.9
  s, heap growth 260 MiB; 100 000 files and 1 000 000 edges, 31.0 s and 1 049 MiB (`KATEDRALA_SCALE=1 pnpm
test packages/inference/src/scale.test.ts`). Module inference dominates (7.0 s of 9.9 s at 48 000 files),
  then the aggregation of dependencies. Milestone 13 sets the budgets.

## After v1

- **More languages:** Python, Java, Go, Rust and C# adapters on the existing contract.
- **Type-checker-assisted resolution:** optional precise call graphs using a full TypeScript program
  (TypeScript 7 API) for repositories with a valid project configuration.
- **Editor integration:** a language-server/VS Code extension showing impact and rule violations inline.
- **Pull-request analysis:** posting `katedrala diff` results as review comments in CI.
- **More frameworks:** React/Next.js, Angular, Vue, Spring, Django.
- **Exporters:** GraphML, Structurizr DSL, C4 diagrams.
