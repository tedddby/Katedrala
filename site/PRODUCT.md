# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Landing site: React with Next.js (App Router, static export) and TypeScript, in `site/` with its own toolchain,
separate from the engine's workspace and CI. The user chose React over the Astro recommendation. Hosting is
undecided, so the build must stay a portable static export that works on any static host.

## Users

Software developers, tech leads and architects who work in non-trivial TypeScript/JavaScript codebases and need to
understand structure before changing it: dependencies, boundaries, structural risk and the impact of a change.
Secondary audience: builders of developer tools (visualizers, CI gates, IDE extensions) who want a machine-readable
architecture model to build on.

## Product Purpose

Katedrala is an open-source software architecture intelligence engine. It reconstructs the architecture hidden in
source code (symbols, relationships, dependencies, components, modules, architecture, insights) and exposes it
through a versioned, machine-readable IR and programmatic APIs. Success: a developer can see the real structure of
a system, trust why each conclusion was reached, and act on it (refactor, enforce boundaries, assess a change).

## Positioning

An architecture engine, not a visualization product. Analysis is deterministic (the same input yields
byte-identical output), explainable (every relationship carries provenance: file, line, mechanism, confidence) and
independent of LLMs. Established concepts are cited; Katedrala's own heuristics (Architectural Gravity,
Architectural Entropy) are labelled as heuristics. Other tools consume its versioned JSON IR; CodeVerse is one
planned consumer.

## Operating Context

Developers run it on a repository from a terminal or in CI, or call it as a library. Planned v1 interfaces: CLI
commands `analyze`, `health`, `graph`, `modules`, `impact`, `rules`, `validate`, `diff`, `explain` with
`--format json|yaml|human`; a programmatic API (`analyze`, `impact`, `diff`, `validate`); rules in
`katedrala.config.yaml`; `katedrala validate . --fail-on error` as a CI gate on any CI system.

## Capabilities and Constraints

Implemented today (milestones 1 to 4):

- Versioned IR (schema 1.0.0) with JSON Schemas, stable identifiers and canonical, byte-identical serialization.
- TypeScript/JavaScript extraction with the TypeScript 6 compiler API: symbols, imports, exports, references,
  environment reads and HTTP calls.
- Module resolution: tsconfig paths and `extends`, package `exports`, pnpm/npm workspaces, dist-to-source mapping.
- Linking into typed edges (imports, calls, instantiates, extends, implements, references-type, uses, ...) with
  provenance and confidence, packages and externals.
- Graph algorithms: strongly connected components, cycles, reachability, propagation cost, betweenness,
  PageRank, Louvain, feedback arc set.
- The structure stage of the engine (`analyzeStructure`) with caching and parallel parsing.

In development for v1 (milestones 5 to 15): inference of components, modules and layers; metrics including
Architectural Gravity and Architectural Entropy; anomaly detection; the YAML rules engine; impact analysis;
architecture diff; the CLI; git history and CI integration; Express, NestJS and Fastify awareness; the
`@katedrala/codeverse` adapter.

Constraints: TypeScript and JavaScript are the only supported languages today. Inference is heuristic and says so.
Katedrala never labels code "bad"; it reports anomalies, risks and violations. No LLM in core analysis.

## Brand Commitments

The name Katedrala means "cathedral". The metaphor works only through structure, geometry, hierarchy, foundations
and depth; never literal church imagery, crosses or fantasy. Voice: technical, precise, honest; no "AI-powered"
marketing language, no hype verbs. Every claim must match the implementation or be presented as in development.

## Evidence on Hand

- Real output: Katedrala's structure analysis of CodeVerse (github.com/tedddby/CodeVerse, commit 6b942bc):
  644 files listed, 594 TypeScript/JavaScript files analyzed, 3,766 symbols, 14,233 relationships, 59 external
  dependencies; two runs produced byte-identical documents. The user approved showing these counts; no speed
  claims.
- 15 fixture repositories with machine-readable ground truth in `fixtures/` (layered, clean, tangled, monorepo,
  Express, NestJS, Fastify, ...).
- Repository: github.com/tedddby/Katedrala (given by the user; may not be public yet). License: MIT.
- CodeVerse: live at https://codeverse.awab.tech. It explores a GitHub repository as an interactive 3D city
  (directories as districts, files as buildings, imports as arcs). It does not use Katedrala yet; Katedrala is
  being built to power it.
- Absent and never to be fabricated: users, customers, logos, testimonials, GitHub stars, downloads, benchmarks,
  supported languages beyond TypeScript/JavaScript.

## Product Principles

1. Determinism is part of the contract: identical input, identical output.
2. Every conclusion has evidence the user can inspect.
3. Honesty over impressiveness: label heuristics, label demonstrations, label what is still in development.
4. An engine with a stable contract: the IR is the product other tools build on.
5. Describe structure, not virtue: anomalies, risks and violations, never "bad code".

## Accessibility & Inclusion

WCAG 2.2 AA: keyboard navigation, visible focus, sufficient contrast, reduced-motion support, and text
alternatives for every interactive visualization.
