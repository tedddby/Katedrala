# Katedrala

**Architecture intelligence for real codebases.** Katedrala reads the source code of a software system,
determines its architectural structure, measures it, finds structural risks and rule violations, and exposes
everything through a deterministic, versioned, machine-readable model that other tools can build on.

> **Status:** under active development toward v1. See [docs/ROADMAP.md](docs/ROADMAP.md) for what is done.

## Why

Dependency analyzers tell you that `a.ts` imports `b.ts`. Architects need answers to different questions:

- What are the components and the logical modules of this system — and do they match the directory layout?
- Which components are central? Where are the boundaries, and where are they violated?
- Where are the cycles, the tightly coupled clusters, the components everything depends on?
- What breaks if I change `PaymentService`, and why?
- How is the architecture evolving, and what risks are emerging?

Katedrala answers these questions **deterministically and with evidence**: every relationship points to the
line of code it came from, every inferred grouping carries a confidence and the observations behind it, and
every score is decomposed into the measurements that produced it. There is no LLM in the analysis engine.

## How it works

```text
source files ──► language adapters ──► Architecture IR ──► graph projections ──► inference, metrics,
 (working tree     (TypeScript,         (files, symbols,     (symbol / file /       anomalies, rules,
  or git commit)    JavaScript, ...)     typed edges)         module level)          impact, diff
                                                                                         │
                                       JSON / YAML / human output ◄── versioned schema ◄─┘
```

- **Language adapters** turn each file into language-neutral facts (declarations, imports, exports,
  references). TypeScript and JavaScript are supported first; the engine itself is language-agnostic.
- The **Architecture IR** is a formal, versioned representation with stable identifiers
  (`file:src/payments/service.ts`, `sym:src/payments/service.ts#PaymentService.charge`) that survive edits,
  enabling diffs, history and caching.
- The **dependency graph** is a typed multigraph (imports, calls, inheritance, type usage, configuration,
  service and package dependencies), each edge with provenance.
- **Architectural inference** proposes logical modules and layers from dependency structure, naming and
  location — explicitly labelled as inference, with confidence and evidence.
- **Metrics** combine established measures (Martin's instability and abstractness, propagation cost,
  betweenness centrality, PageRank) with two documented Katedrala heuristics: **Architectural Gravity** and
  **Architectural Entropy**.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and [docs/IR.md](docs/IR.md) for the data model.

## Get started

Katedrala is not on npm yet (packages are planned for v1), but the engine already runs as a library from a
clone of this repository. You need Node.js 22.12 or later and pnpm 11 (`corepack enable`, or install pnpm
directly).

```bash
git clone https://github.com/tedddby/Katedrala.git
cd Katedrala
pnpm install
pnpm build
```

Save this script as `analyze.mjs` in the repository root, where `@katedrala/engine` resolves:

```js
import { analyzeStructure } from "@katedrala/engine";

const { document } = await analyzeStructure({ root: process.argv[2] ?? "." });
console.log(document.repository.stats);
```

Then point it at a TypeScript or JavaScript project:

```bash
node analyze.mjs path/to/your/project
```

It prints the project's counts: files, symbols, relationships (`edges`), externals, and the imports and
references that could not be resolved. `document` holds the structural sections of the architecture document
described in [docs/IR.md](docs/IR.md): every file, symbol and typed relationship, with the file and line each
relationship came from. Extraction results are cached in your user cache directory (`KATEDRALA_CACHE_DIR`
moves it).

`analyzeArchitecture` returns the same structure plus the architectural view: components, derived from the
directory tree and the package manifests, and modules and layers, inferred from dependencies, naming and
location (or declared in `katedrala.config.yaml`). Save this as `architecture.mjs`:

```js
import { analyzeArchitecture } from "@katedrala/engine";

const { document } = await analyzeArchitecture({ root: process.argv[2] ?? "." });
for (const module of document.modules) {
  const how = module.inference ? `inferred, confidence ${module.inference.confidence}` : "declared";
  console.log(`${module.id} (${how}): ${module.files.join(", ")}`);
  if (module.inference) console.log(`  ${module.inference.reason}`);
}
for (const layer of document.layers) console.log(`${layer.id}: rank ${layer.rank}`);
```

Every inferred module and layer carries its confidence, the evidence behind it and a one-sentence reason
that begins with "Inferred:"; [docs/ALGORITHMS.md](docs/ALGORITHMS.md) explains how they are computed and
what the numbers mean. Metrics, rules and the command line are on the [roadmap](docs/ROADMAP.md).

## Development

```bash
pnpm install
pnpm check
```

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
