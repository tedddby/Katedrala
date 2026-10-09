# The Katedrala Architecture IR

The Katedrala Architecture Intermediate Representation (IR) is the contract between Katedrala and everything
that consumes its results: the CLI, CodeVerse, editor integrations, CI tooling and your own scripts. This
document is normative: where it and the code disagree, it is a bug in one of them.

- TypeScript types: [`packages/ir/src/types`](../packages/ir/src/types) (TSDoc on every field)
- JSON Schemas (draft 2020-12): [`packages/ir/schema`](../packages/ir/schema)
- Current schema version: **1.0.0**

Contents: [Documents](#documents) · [Reading documents](#reading-documents-versioning-and-tolerance) ·
[Conventions](#conventions) · [Identifiers](#identifiers) · [Structure](#structure) ·
[Relationships](#relationships) · [Architecture](#architecture) · [Metrics and findings](#metrics-and-findings) ·
[Detail and limits](#detail-and-limits) · [Ordering and determinism](#ordering-and-determinism) ·
[Consuming documents](#consuming-documents)

## Documents

Every output is a self-describing JSON document with a `kind` discriminator, a `schemaVersion` and the
`generator` that produced it:

| `kind`                   | Produced by          | Consumer schema            | Strict schema                     |
| ------------------------ | -------------------- | -------------------------- | --------------------------------- |
| `katedrala.architecture` | `katedrala analyze`  | `architecture.schema.json` | `architecture.strict.schema.json` |
| `katedrala.impact`       | `katedrala impact`   | `impact.schema.json`       | `impact.strict.schema.json`       |
| `katedrala.diff`         | `katedrala diff`     | `diff.schema.json`         | `diff.strict.schema.json`         |
| `katedrala.health`       | `katedrala health`   | `health.schema.json`       | `health.strict.schema.json`       |
| `katedrala.explain`      | `katedrala explain`  | `explain.schema.json`      | `explain.strict.schema.json`      |
| `katedrala.validation`   | `katedrala validate` | `validation.schema.json`   | `validation.strict.schema.json`   |
| `katedrala.history`      | `katedrala history`  | `history.schema.json`      | `history.strict.schema.json`      |

The architecture document is the complete model of one snapshot of one repository:

```text
ArchitectureDocument
├── kind, schemaVersion, generator        what produced it
├── repository                            identity, VCS, languages, statistics
├── snapshot                              what was analyzed; content, analysis and configuration digests
├── detail, limits                        how much the document contains; list bounds
├── directories, packages, files          structure (observed)
├── symbols                               declarations (observed)
├── externals                             packages, built-ins, environment variables, services
├── edges                                 typed relationships with provenance (observed)
├── entryPoints                           declared ways into the code
├── components, modules, layers           architecture (derived / inferred)
├── endpoints                             externally reachable entries (detected)
├── metrics                               definitions, system metrics, entropy, per-unit metrics
├── anomalies, violations, rules          findings
├── diagnostics                           problems encountered while analyzing
└── run (optional)                        timings, cache statistics, the command line — not deterministic
```

Every report (`impact`, `explain`, `validation`, `health`) carries an `analysis` block with the completeness of
the underlying analysis (failed files, unresolved imports and references, diagnostics by severity), so a CI
gate can refuse to trust results of a broken run.

## Reading documents: versioning and tolerance

`schemaVersion` follows semantic versioning, independently of the Katedrala version:

- **Major**: removing or renaming a field, changing a field's type or meaning, changing an identifier
  derivation, removing an enumeration value.
- **Minor**: adding optional fields, enumeration values, union branches or document kinds.
- **Patch**: clarifications in documentation and schema descriptions.

**Tolerant reading is normative.** A consumer supporting major version N must accept every N.x.y document,
ignore properties it does not know, and treat unknown enumeration values as "other" (an unknown symbol kind
through its `category`, an unknown edge kind as a generic dependency). Use `isCompatibleSchemaVersion` from
`@katedrala/ir`.

Two schemas are published per document kind:

- the **consumer schema** (`<kind>.schema.json`, `$id` `urn:katedrala:schema:<kind>:<major>`) encodes tolerant
  reading: open objects, enumerations as "known values or any string", unions that accept unknown branches,
  `schemaVersion` pinned to the major version;
- the **strict schema** (`<kind>.strict.schema.json`, `$id` `urn:katedrala:schema:<kind>:<version>:strict`)
  validates exactly one version with closed objects and closed enumerations; producers (Katedrala's own tests,
  plugin authors) use it to catch mistakes.

Enumerations marked _extensible_ accept plugin-reserved values `x-<kebab-case>` (e.g. `x-acme-event`); plugins
should include their own name. The extensible enumerations are listed in `EXTENSIBLE_ENUMERATIONS`.

## Conventions

- **Field names** are camelCase; **enumeration values** are kebab-case.
- **Paths** are POSIX-style and relative to the analysis root, with no leading `./` or `/` and no trailing `/`.
  The root is `""`.
- **Text normalization**: a file's content is decoded as UTF-8, a byte-order mark removed and line endings
  (`\r\n`, `\r`) converted to `\n` before analysis. Positions, line counts and digests refer to the normalized
  text; `size` is the stored size in bytes.
- **Positions**: lines and columns are 1-based integers; columns count UTF-16 code units. A `Range` end is
  exclusive.
- **Line count**: the number of `\n` characters, plus one if the text is non-empty and does not end with `\n`.
- **Digests** are self-describing: `sha256:<64 lowercase hex digits>`.
  - `FileEntity.hash`: SHA-256 of the normalized text encoded as UTF-8.
  - `snapshot.contentDigest`: SHA-256 over the line `<path>\t<hash or ->\t<size>\n` of every file of the
    document in path order.
  - `snapshot.analysisDigest`: SHA-256 over the effective configuration and options, the versions of
    Katedrala (and of the schema), its adapters and plugins, and what the analysis saw outside the
    document's files: paths of listed files that are not document files, skipped links, and the content (or
    absence) of project configuration files read outside the document's files (excluded by `include` /
    `exclude`, or above the analysis root). Documents with equal content and analysis digests are identical.
  - `snapshot.projectConfigurationDigest`: SHA-256 over the project configuration files adapters read,
    including files above the analysis root; reported separately to explain resolution changes.
    Configuration outside the document's files is also covered by `analysisDigest`.
- **Numbers**: counts are integers ≥ 0; confidence values are in `[0, 1]` and express strength of support,
  not a calibrated probability; real-valued measurements are rounded to 9 significant digits; non-finite
  numbers never appear. In a decomposed score, `contribution = weight × normalized` and the score is the sum
  of contributions (within 1e-9).
- **Absent vs null**: an absent optional field means "not applicable / no value"; `null` means "applicable
  but not computable" and is used only where documented (e.g. `instability` of a unit without any
  dependencies or dependents). Arrays are always present, except on symbols and provenance where empty
  optional arrays are omitted (as documented per field).
- **Timestamps** are ISO-8601 UTC (`date-time`).

## Identifiers

Identifiers are deterministic functions of what an entity is. They never contain line numbers, timestamps,
machine-specific paths or declaration order. The same repository analyzed twice yields identical identifiers,
and an entity keeps its identifier across commits as long as its defining properties are unchanged.

| Entity     | Format                                          | Example                                                     |
| ---------- | ----------------------------------------------- | ----------------------------------------------------------- |
| Repository | `repo:<normalized remote>` or `repo:<name>`     | `repo:github.com/acme/shop`                                 |
| Directory  | `dir:<path>` (root: `dir:`)                     | `dir:src/payments`                                          |
| File       | `file:<path>`                                   | `file:src/payments/payment.service.ts`                      |
| Symbol     | `sym:<path>#<qualified name>[~<disambiguator>]` | `sym:src/payments/payment.service.ts#PaymentService.charge` |
| Package    | `pkg:<ecosystem>:<manifest directory>`          | `pkg:npm:packages/api`, root: `pkg:npm:`                    |
| External   | `ext:<namespace>:<name>`                        | `ext:npm:express`, `ext:node:fs`, `ext:env:DATABASE_URL`    |
| Component  | `cmp:<path>` (root: `cmp:`)                     | `cmp:packages/api/src/payments`                             |
| Module     | `mod:<module key>`                              | `mod:payments`, `mod:src/payments`, `mod:src#payment`       |
| Layer      | `layer:<name>`                                  | `layer:service`                                             |
| Endpoint   | `endpoint:<16 hex digits>`                      | `endpoint:5b1c0e7f9a2d4c63`                                 |
| Edge       | `edge:<16 hex digits>`                          | `edge:3f9a0c1d2b4e5f60`                                     |
| Anomaly    | `anomaly:<type>:<16 hex digits>`                | `anomaly:dependency-cycle:9c1e2d…`                          |
| Violation  | `violation:<rule id>:<16 hex digits>`           | `violation:controllers-no-database:51aa…`                   |

### Repository

The repository identifier is derived from the normalized `origin` remote when there is one: scheme,
credentials, port and a trailing `.git` removed, `git@host:path` rewritten to `host/path`, host lower-cased
(`normalizeRemoteUrl`). Otherwise it is `repo:<name>`, where the name is the configured name, else the root
package's declared name, else `repository`. The name is never derived from the checkout directory, so the same
content analyzed from different clones yields the same document.

### Symbols

- The **qualified name** is the dot-separated path of declaration names from the file scope
  (`PaymentService.charge`). Inside each segment `%`, `.` and `~` are percent-encoded (`%25`, `%2E`, `%7E`),
  so dots always separate segments and `~` always introduces the disambiguator (`qualifiedNameOf`). Anonymous
  default exports are named `default`. File-level package or namespace declarations (Java `package`, C#
  file-scoped `namespace`) are not part of qualified names; they are recorded in `FileEntity.namespaces`.
- A symbol's identity within its file is (qualified name, kind, static-ness, key). Declarations with the same
  identity are one symbol: function overloads, interface and namespace declaration merging. All merged parts
  are listed in `declarations`; `range` is the implementation (the declaration with a body) when one exists.
- When distinct identities share a qualified name, the bare identifier goes to the one that comes first by
  **kind precedence** (`SYMBOL_KIND_PRECEDENCE`: class, struct, record, enum, function, method, constructor,
  accessor, property, field, event, constant, variable, macro, module, namespace, interface, trait, type,
  type-alias, enum-member), then instance before static, then by key. Source order never matters: reordering
  `const User` and `type User` does not change which identifier denotes which declaration.
- The others get the disambiguator `<kind>[-static][-<key>]`: `Foo~namespace`, `A.create~method-static`.
  A _key_ is a content-derived discriminator an adapter may supply (e.g. the implemented trait of a Rust
  `impl` method), never a position or a counter.
- In the path part, `%` is written `%25` and `#` is written `%23`, so the first `#` separates path and
  qualified name. Qualified names may contain `#` (private members such as `Klass.#secret`).

### Packages, modules, externals, endpoints

- **Packages** are identified by ecosystem and manifest location, so names may repeat (fixtures, examples)
  and renaming a package keeps its identity. The declared name is the `name` field.
- **Declared modules** are `mod:<configured name>` (names must not contain `#` or `~`).
- **Inferred modules** are identified by their anchor: `mod:<directory>`, or `mod:<directory>#<stem>` for
  modules anchored on a name stem (`inferredModuleKey`).
  - The directory part is the anchor directory, normalized, with `%`, `#` and `~` written `%25`, `%23` and
    `%7E`, the encodings symbol identifiers use. The first `#` therefore always separates directory and stem,
    and `~` only introduces the `~inferred` suffix.
  - The analysis root is written `.`, also when a stem follows: `mod:.`, `mod:.#payment`.
  - Stems are names with ASCII letters lower-cased: the S-stemmed first token of the member files' names
    (`payment`), the S-stemmed name of a sub-directory that recurs below several layer directories
    (`controllers/payment/` and `services/payment/` give `payment`), or, for a piece of an oversized directory
    without a common stem, the hyphen-joined tokens of a file name (`format-date-ts`) or 16 hex digits. Stems
    never contain `%`, `#`, `~` or `/` (a sub-directory whose name contains one gives no stem), so they are
    written as they are.
  - `~inferred` is appended in the rare case the key equals a declared module's name.
  - Examples: directory `src/payments` gives `mod:src/payments`; directory `src` and stem `payment` give
    `mod:src#payment`; directory `src/a#b` gives `mod:src/a%23b`, distinct from directory `src/a` with stem
    `b` (`mod:src/a#b`); `src/50%` gives `mod:src/50%25`; a directory named `x~inferred` gives
    `mod:x%7Einferred`, distinct from `mod:x~inferred` (directory `x` colliding with a declared module `x`).
  - Pre-release change (identifier derivation, schema version 1.0.0 kept because no document with modules
    had been produced): before milestone 5 the root was written `.` only without a stem (`mod:#payment`), and
    the directory part was not escaped.
- **Externals** use a namespace registry (`EXTERNAL_NAMESPACES`): `npm`, `node`, `pypi`, `python`, `maven`,
  `jdk`, `go`, `go-std`, `cargo`, `rust-std`, `nuget`, `dotnet`, `env`, `http`, `datastore`; plugins use `x-`
  namespaces. For packages, the name is the distribution name the package manager uses (what manifests
  declare), not necessarily the name used in imports.
- **Endpoints**: `endpoint:` + the first 16 hex digits of SHA-256 of `"<protocol>\n<method>\n<path>\n<handler>"`.

### Hashed identifiers

Edges, anomalies and violations have hashed identifiers. The derivations are part of the contract; any
consumer can recompute them (all strings UTF-8, SHA-256, first 16 lowercase hex digits):

- `edge:` + hash of `"<kind>\n<source id>\n<target id>"`.
- Directional anomaly types (`boundary-bypass`, `upward-dependency`, `unstable-dependency`,
  `undeclared-dependency`): `anomaly:<type>:` + hash of `"<source>\n<target>"`.
- Other anomaly types: `anomaly:<type>:` + hash of the distinct subject ids sorted and joined by `"\n"`. A
  `dependency-cycle` anomaly is one strongly connected component; its subjects are the members.
- `violation:<rule>:` + hash of `"<rule>\n<source>\n<target or empty>\n<discriminator or empty>"`, where the
  discriminator is a stable identity component (never a measured value).

## Structure

- **`FileEntity`**: path, language and dialect, role (`source`, `test`, `declaration`, `configuration`,
  `script`, `generated`, `vendored`, `documentation`, `asset`, `data`, `other`), size, lines, digest, analysis
  status (`parsed`, `partial`, `unsupported`, `skipped`, `failed` — Katedrala never pretends a file was analyzed
  when it was not), declared namespaces, symbols, imports (with resolution), exports, architectural roles.
- **`ImportEntry`**: specifier, semantic `kind` (`static`, `dynamic`, `re-export`, `side-effect`, `include`,
  `module-declaration`), syntax `mechanism`, `typeOnly`, the enclosing symbol for nested imports, flags
  (`wildcard`, `global`, `optional`) and a `resolution` — resolved to one or more files (several for
  package-level imports), excluded (resolved to files the configuration excludes from the analysis, given by
  path; neither counted as unresolved nor reported as a diagnostic), external, builtin, unresolved (with a
  reason) or non-literal. `typeOnly` is syntactic (`import type`, every specifier marked `type`).
- **`ExportEntry`**: exported name (`default`; `=` for an export assignment such as `export =` and
  `module.exports =`; `*` for `export * from`), the declarations it denotes (several when one name denotes a
  value and a type) and, for re-exports, the resolved module.
- **`SymbolEntity`**: name, escaped qualified name, kind with a closed coarse `category` (`type`, `callable`,
  `value`, `namespace`), file, lexical `parent`, semantic `owner` (for members declared outside their type),
  range, merged declarations, `exported` (visible outside its language-level module unit), language-neutral
  `visibility` (`private`, `file`, `protected`, `package`, `module`, `public`), `abstract` (interfaces and
  traits declaring behaviour, abstract classes), modifiers, decorators, signature, roles.
- **`PackageEntity`**: a manifest with its declared dependencies and its observed code-level dependencies.
- **`EntryPointEntry`**: declared ways into the code (manifest fields, scripts, framework conventions,
  configuration), mapped back from build output to sources (`mappedFrom`).
- **`ExternalEntity`**: things outside the repository, with their namespace and, for packages, whether every
  importing package declares them (`declared`; a package that imports an npm package only with type-only
  imports may declare its `@types` package instead).

## Relationships

`edges` is a directed multigraph; direction is always dependent → dependency. Each `EdgeEntity` has a `kind`,
a `source` and a `target` (files, symbols, packages or externals), `observations` (total count),
`typeOnly` (every observation is in a type-only position), a `confidence` and the observations themselves
(`provenance`): file, line, column, syntactic `mechanism`, the `resolution` method that identified the target,
re-export files traversed (`via`), and the detector for framework-established edges.

Different relationship kinds between the same two nodes are separate edges; repeated observations of the
same kind are aggregated into one edge. `provenance` is truncated to `limits.maxProvenancePerEdge`; it is
complete if and only if its length equals `observations`.

| Kind                  | Typical source → target           | Example                                 |
| --------------------- | --------------------------------- | --------------------------------------- |
| `imports`             | file → file / external            | `import { x } from "./x"`               |
| `re-exports`          | file → file / external            | `export * from "./x"`                   |
| `calls`               | symbol / file → symbol / external | `charge(order)`                         |
| `instantiates`        | symbol / file → symbol / external | `new PaymentService()`                  |
| `extends`             | symbol → symbol / external        | `class A extends B`                     |
| `implements`          | symbol → symbol / external        | `class A implements Port`               |
| `references-type`     | symbol / file → symbol / external | `(order: Order) => …`                   |
| `uses`                | symbol / file → symbol            | reading a constant, rendering `<Cart/>` |
| `decorated-by`        | symbol → symbol / external        | `@Injectable() class S {}`              |
| `depends-on-package`  | package → package / external      | `"dependencies": { "zod": "^4" }`       |
| `reads-configuration` | symbol / file → external          | `process.env.DATABASE_URL`              |
| `calls-service`       | symbol / file → external          | `fetch("https://api.stripe.com/…")`     |
| `accesses-data`       | symbol / file → external / symbol | repository → database model             |

Code at file scope (outside any declaration) is attributed to the file. The linker chooses the edge kind from
the syntactic reference kind and the kind of the resolved target (a call of a class is an instantiation).

## Architecture

- **Components** (`cmp:`) are physical units: package roots and source directories, arranged in a tree. Each
  component owns the files directly inside it; `totals` aggregate the whole subtree; `dependencies` and
  `dependents` are computed over directly owned files.
- **Modules** (`mod:`) are logical groupings of files, inferred (with `anchor` and `inference`: confidence,
  method, reason, evidence) or declared in configuration. Modules may cut across directories and packages.
  `entryPoints` is the intended public surface (configured entry files or barrels at the anchor); `publicApi`
  is the actual surface (member files that other modules import from).
- **Layers** (`layer:`) are horizontal roles ordered by `rank`. They partition files: a file belongs to at
  most one layer. Dependencies are expected to point from lower to higher rank.
- **Endpoints** are externally reachable entries (e.g. HTTP routes) detected by framework detectors, with
  method, path template, handler, location and inference.

Aggregated dependencies (`AggregatedDependency`) lift every relationship between member files (including
symbol-level ones) to the units, on the metrics projection, and report distinct edges (`edgeCount`), total
observations, runtime (non-type-only) edges and counts per kind. Package-level dependencies also include
the externals the package's files use (`PackageEntity.dependencies`).

## Metrics and findings

- `metrics.definitions` describes every metric reported (name, unit, range, whether higher is better or worse,
  levels, provider, method, and whether it is an established measure or a Katedrala heuristic).
- `metrics.projection` states the graph the metrics were computed on (edge kinds, type-only handling, file
  roles; tests are excluded by default).
- `metrics.system` holds system-level measurements; `metrics.entropy` the decomposed Architectural Entropy;
  `metrics.units` per-unit metrics for packages, modules, layers, components, files and (with
  `detail.symbolMetrics`) symbols. PageRank is reported relative to the number of units (mean 1).
- `anomalies` are evidence-backed structural observations (cycles, hubs, boundary bypasses, ...); directional
  anomalies carry `source` and `target`.
- `violations` are breaches of configured rules; `rules` summarizes every rule's outcome, including how many
  units its selectors matched, a digest of its definition and configuration problems.
- `diagnostics` list problems encountered while analyzing (syntax errors, unresolved imports, limits,
  approximations).

See [ALGORITHMS.md](ALGORITHMS.md) for metric definitions and references.

## Detail and limits

`detail` states what a document contains, so consumers can tell "omitted" from "none":

- `symbols` — whether declarations are listed;
- `relationships` — `symbol` (code relationships keep symbol endpoints) or `file` (symbol endpoints lifted
  to files, for compact documents of very large repositories);
- `symbolMetrics` — whether `metrics.units` includes symbols.

`limits` records every bound applied to lists (`maxProvenancePerEdge`, `maxLocationsPerFinding`,
`maxExamplesPerDependency`, `maxEvidenceEntities`). Bounded lists are selected by sorting in their documented
total order and then truncating.

## Ordering and determinism

For identical inputs (content, configuration, Katedrala version) a document is byte-identical when serialized,
except for the optional `run` section, on every platform. String comparison is by UTF-16 code units,
independent of locale. Collections follow total orders:

| Array                                                   | Order                                                      |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| entity arrays (`files`, `symbols`, `modules`, ...)      | by `id` (duplicates are an error)                          |
| `edges`                                                 | by `source`, `target`, `kind`                              |
| `provenance`                                            | by file, line, column, mechanism, resolution, specifier, … |
| `locations`                                             | by file, line, column                                      |
| `layers`                                                | by `rank`, then `id`                                       |
| `entryPoints`                                           | by entity, kind, source                                    |
| `FileEntity.symbols`, `FileEntity.imports`              | source order                                               |
| `FileEntity.exports`                                    | by name, `from`, `typeOnly`, symbols                       |
| `PackageEntity.declaredDependencies`                    | by name, scope, version range, target                      |
| `metrics.units`                                         | by entity                                                  |
| `metrics.definitions`                                   | by key                                                     |
| `diagnostics`                                           | by file, line, column, code, message                       |
| `rules.results`                                         | configuration order                                        |
| score terms (`terms`, `factors`)                        | formula order                                              |
| `repository.languages`                                  | by descending line count, then language                    |
| keys of record fields (`kindCounts`, `extensions`, ...) | sorted                                                     |

Producers keep collections canonical at every stage boundary (plugins see canonical input), reduce floating
point values in canonical order on one thread, use fixed seeds for any sampling, and call
`canonicalizeDocument` before serializing. `serializeDocumentChunks` streams very large documents.

## Consuming documents

```ts
import { DocumentIndex, isCompatibleSchemaVersion, type ArchitectureDocument } from "@katedrala/ir";

const doc = JSON.parse(text) as ArchitectureDocument;
if (!isCompatibleSchemaVersion(doc.schemaVersion))
  throw new Error("Unsupported Katedrala document");

const index = new DocumentIndex(doc);
const service = index.fileByPath("src/payments/payment.service.ts");
const dependents = service ? index.dependents(service.id) : [];
const findings = service ? index.anomaliesFor(service.id) : [];
```

`@katedrala/ir` has no dependencies and runs in browsers. Documents store each relationship once; dependency
and dependent lists of files and symbols are derived by `DocumentIndex` (in canonical order), together with
edge, metric, finding, layer and endpoint lookups.
