# Roadmap

Katedrala is built in milestones. Each milestone ends with passing tests, lint, type checking, a manual
inspection of real output and updated documentation; later milestones never build on broken foundations.

## v1 milestones

| #   | Milestone                             | Scope                                                                                                          | Status  |
| --- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Foundation, architecture, IR          | Monorepo tooling, CI, IR types, stable identifiers, canonical serialization, JSON Schemas, plugin contracts    | Done    |
| 2   | TypeScript/JavaScript parsing         | TS/JS adapter (TypeScript 6 compiler API), extraction of symbols, imports, exports, references, facts          | Planned |
| 3   | Dependency graph                      | Discovery, module resolution (tsconfig paths, workspaces, package exports), linking, typed edges, provenance   | Planned |
| 4   | Graph algorithms                      | CSR graphs, SCC, cycles, reachability, shortest paths, depth, centrality, PageRank, clustering                 | Planned |
| 5   | Architectural inference               | Components, modules (clustering with structural priors), layers, confidence and evidence                       | Planned |
| 6   | Metrics                               | Martin metrics, propagation cost, Lakos CCD, core–periphery roles, Architectural Gravity, Entropy              | Planned |
| 7   | Anomaly detection                     | Cycles, god components, hubs, boundary bypass, upward/unstable dependencies, coupled clusters, orphans         | Planned |
| 8   | Rules engine                          | Configuration schema, selectors, forbidden/allowed dependencies, layers, isolation, direction, fan-out, cycles | Planned |
| 9   | Impact analysis                       | Blast radius with explanation paths, affected modules, tests and integrations, risk factors                    | Planned |
| 10  | Architecture diff                     | Document comparison: modules, dependencies, cycles, entropy, gravity, violations                               | Planned |
| 11  | CLI                                   | All commands, human/JSON/YAML output, exit codes, `--quiet/--verbose/--no-color`                               | Planned |
| 12  | Git and CI integration                | Git snapshot sources, `diff <rev> <rev>`, `history`, `validate --fail-on`                                      | Planned |
| 13  | Performance and caching               | Content-addressed cache, worker pool, benchmarks                                                               | Planned |
| 14  | CodeVerse adapter                     | `@katedrala/codeverse` visualization model                                                                     | Planned |
| 15  | Documentation and release preparation | Complete documentation, examples, release process                                                              | Planned |

Framework awareness (Express, NestJS, Fastify) is developed alongside milestones 7–12, once the core engine
is stable.

## After v1

- **More languages:** Python, Java, Go, Rust and C# adapters on the existing contract.
- **Type-checker-assisted resolution:** optional precise call graphs using a full TypeScript program
  (TypeScript 7 API) for repositories with a valid project configuration.
- **Editor integration:** a language-server/VS Code extension showing impact and rule violations inline.
- **Pull-request analysis:** posting `katedrala diff` results as review comments in CI.
- **More frameworks:** React/Next.js, Angular, Vue, Spring, Django.
- **Exporters:** GraphML, Structurizr DSL, C4 diagrams.
