# Architectural inference: components, modules and layers (milestone 5 design)

Status: design proposal for `@katedrala/inference`, to be adapted into `docs/ALGORITHMS.md` (components,
modules, layers), `docs/RULES.md` (interaction with declared modules and layers) and implementation specs.

Every element is labelled:

- **[ESTABLISHED]**: a published concept, with a reference verified for this design (section 11).
- **[KATEDRALA HEURISTIC]**: a Katedrala-specific rule, with its rationale and limitations. It is never
  presented as established.
- **[DERIVED]**: a deterministic function of observed data (no judgement involved).

Prototype evidence: every number quoted for a fixture was produced by Python prototypes of this design
run on the repository's fixtures (graphs built from each fixture's `expected.json` imports, with named
imports resolved through barrels to approximate the linker's symbol-level edges). The prototypes live in
the design scratch folder (`m5/infer3.py`, `layers.py`, `layer_conf.py`, `components.py`,
`stability_exp.py`, `ego_exp.py`, `split_exp.py`); they are not part of the product.

## Contents

0. Summary of decisions
1. Inputs, outputs, shared definitions
2. Components
3. Modules
4. Layers
5. Evidence, reasons and explanation formats
6. Configuration
7. Complexity and scale
8. Determinism
9. Test plan
10. IR impact
11. References

---

## 0. Summary of decisions

| Topic | Decision |
| --- | --- |
| Pipeline order | components → architectural roles → modules → layers → aggregated dependencies. Each step reads only the model and the outputs of earlier steps. |
| Components | [DERIVED] Every directory that directly contains a code file, every package root and every branch point (≥ 2 child directories with code) is a component; chains of directories without files collapse into their deepest member. |
| Inference graph | [KATEDRALA HEURISTIC] File-level projection restricted to `source` files; each ordered file pair weighs 1.0 if any underlying edge survives at runtime, 0.5 if all are type-only. Observation counts are deliberately ignored. |
| Module algorithm | [KATEDRALA HEURISTIC] *Prior-anchored refinement*: directory/naming priors per package, then a strict-majority reassignment of individual files (a constrained relative of label propagation), with composition roots, shared utilities and barrels pinned. Louvain is used only to split oversized flat directories. Unconstrained modularity clustering is rejected for module identity (section 3.2: on the fixtures it moved 0.6–7.2 files per single-edge change versus ≤ 0.10 for the prior-anchored algorithm). |
| Organization style | Detected per directory group: *feature*, *layer + recurring feature stems* (stem modules `mod:<dir>#<stem>`), *layer only*, or *mixed*; reported as evidence. |
| Identity | [KATEDRALA HEURISTIC] A module's id derives from its prior (directory or stem), never from the final membership, so files moving in or out never change ids. |
| Confidence | [KATEDRALA HEURISTIC] Weighted sum of internal edge ratio, membership margin, prior agreement and a saturating size term (weights by module kind); every term is an `Evidence` entry with `value` and `weight`. |
| Declared modules | Exact glob membership, removed from inference; inferred modules never contain declared files; rules target declared modules unless told otherwise. |
| Tests, declarations | Not evidence. Attached to modules afterwards for navigation (strict majority of what they import/what imports them, then location); never members of layers. |
| Layers | [KATEDRALA HEURISTIC] Per-file layer label from roles (configuration > detector > naming) and layer-named directories, combined by noisy-OR; ranks from the observed layer dependency graph (SCC condensation, exact minimum feedback ordering for small SCCs, greedy FAS otherwise, conventional order only for incomparable layers), rank = longest path from the outermost layer. |
| Randomness | None. Everything is a deterministic function of the sorted document. |
| IR changes | None required. Two documentation clarifications (section 10). |

---

## 1. Inputs, outputs, shared definitions

### 1.1 Outputs (IR, `packages/ir/src/types/architecture.ts`)

- `components: ComponentEntity[]` — derived, no `InferenceInfo`.
- `modules: ModuleEntity[]` — inferred modules carry `anchor` and `inference`; declared modules carry
  neither.
- `layers: LayerEntity[]` — sorted by rank, then id; inferred layers carry `inference`.
- `FileEntity.roles` — gains `RoleEntry` items with `source` `naming`, `location` or `configuration`
  (framework detectors add their own entries in later milestones).
- `dependencies`/`dependents` of components, modules and layers — computed with
  `aggregateDependencies(model, level, metricsProjectionOptions)` from `@katedrala/model`, after the
  memberships are final, so aggregated dependencies agree with `metrics.projection` by construction.

### 1.2 Inputs

- `ArchitectureModel.from(document)` with the observed sections (directories, packages, files, symbols,
  edges, entry points) and the configuration.
- The **inference graph** (1.3), built from `model.projection({ level: "file", ... })`.
- Graph algorithms from `@katedrala/graph`: `UndirectedGraph.fromEdges`, `louvain`, `modularity`,
  `stronglyConnectedComponents`, `condensation`, `greedyFeedbackArcSet`, `longestPathLengths`,
  `topologicalOrder`.

### 1.3 The inference graph [KATEDRALA HEURISTIC]

Nodes: files with `role = "source"` (configurable), sorted by id, minus files owned by declared modules
(section 3.14). Built from

```ts
const p = model.projection({
  level: "file",
  edgeKinds: metricsProjection.edgeKinds,      // the user's edge-kind choice applies
  includeTypeOnly: true,                       // type usage is evidence, at reduced weight
  fileRoles: new Set(inference.modules.file_roles), // default {"source"}
});
```

For every projection edge `u → v` (u ≠ v), with `info = p.edgeInfo(u, v)`:

```
w(u, v) = 0                         if every underlying edge has confidence < min_edge_confidence (0.5)
        = 1.0                       if info.runtimeEdgeCount > 0
        = type_only_weight (0.5)    otherwise
```

Directed weights are kept (`dependents` and `dependencies` of a file are needed separately); the undirected
weight is `w̄(u, v) = w(u, v) + w(v, u)`.

Why not `observations`: one file calling thirty functions of another would outvote thirty files that each
import it once; membership is a question of *which files* work together, which is also how the fixtures
define "mostly" ("a strict majority of the distinct dependent files"). Lutellier et al. (2018) found that
the accuracy of the input dependencies has a major influence on recovery quality [ESTABLISHED]; the
projection lifts symbol-level relationships (calls, type references through barrels) to files, which is
what the weights summarize. Type-only edges count half because they vanish at runtime yet still express
logical coupling; `type_only_weight: 0` disables them.

Edges with an endpoint outside the node set (tests, declarations, declared-module files, externals,
other packages' files for module inference) are not evidence for module membership.

### 1.4 Shared lexical definitions [KATEDRALA HEURISTIC]

- **Name head and qualifiers.** Strip the last extension; split the rest on `.`: the first part is the
  *head*, the others are *qualifiers* (`payment.controller.ts` → head `payment`, qualifiers
  `[controller]`; `index.d.ts` is a declaration and never reaches this point).
- **Tokens.** Split the head on `-`, `_`, `.`, spaces and camel-case boundaries (`OrderLine` →
  `order line`, `HTTPServer` → `http server`), lower-cased.
- **S-stemming.** Harman's S-stemmer (Harman 1991) [ESTABLISHED]: `-ies` → `-y` (not after `e`/`a`),
  `-es` → `-e` (not after `a`/`e`/`o`), `-s` → `` (not after `u`/`s`); plus a Katedrala sibilant rule:
  `-sses`, `-xes`, `-shes`, `-zzes` drop `es` (`addresses` → `address`, `boxes` → `box`), and length
  guards (`-ies` only for words longer than 4 characters, `-s` only for words longer than 3) so that short
  tokens such as `bus`, `gas`, `ids` are kept. Stems are used for grouping only; display names keep the
  original spelling (3.10).
- **File stem.** `stem(f)` = S-stem of the first token of the head, unless it is a role token
  (`controller`, `service`, `repository`, `model`, `dto`, `route`, `module`, ... — the union of the
  vocabularies in 4.2) or a generic token (`index`, `main`, `app`, `server`, `types`, `utils`, `config`,
  `errors`, `common`, `shared`, `base`, ...), or shorter than 2 characters; then the file has no stem.
  `payment-gateway.ts` → `payment`; `order-line.ts` → `order`; `OrderService.ts` → `order`.
- **Directory kinds** (vocabularies are configuration with these defaults, matched on the S-stemmed,
  lower-cased directory name):
  - *container*: `src`, `source`, `app`, `apps`, `packages`, `features`, `modules`, `domains`,
    `internal`, `pkg`, `cmd`, `libs`;
  - *shared*: `shared`, `common`, `lib`, `util(s)`, `helper(s)`, `core`, `base`, `kernel`, `support`,
    `misc`, `tool(s)`, `config(uration)`, `settings`, `constant(s)`, `type(s)`, `interface(s)`;
  - *layer*: every key of the directory→layer vocabulary of 4.2 (`controllers`, `services`, `domain`, ...);
  - *feature*: everything else.

These vocabularies encode common conventions of the TypeScript/JavaScript ecosystem; they are the main
limitation of the approach for codebases in other languages or naming cultures, which is why every list
is configurable (section 6) and why each conclusion records which vocabulary entry it used.

---

## 2. Components [DERIVED]

Components are physical units and must be derivable without judgement. The rules below are total and
deterministic; nothing in them depends on dependencies.

### 2.1 Owned files

A file is *owned* by the component tree when its `role` is in `inference.components.file_roles`, default
`[declaration, generated, script, source, test]`. Configuration, documentation, assets, data, vendored
and other files are listed in `directories`/`files` but belong to no component (a `package.json` is a
manifest, not part of a unit's code; vendored code is somebody else's architecture). Files whose analysis
status is `unsupported` are owned when their role qualifies: components are physical, so a directory of
Python files in a TypeScript repository is still a unit (with no dependencies).

### 2.2 Which directories become components

Let `O` be the owned files and `sub(d)` the owned files in the subtree of directory `d`. A directory is a
component when `sub(d) ≠ ∅` and at least one holds:

1. `d` is the analysis root `""`;
2. `d` directly contains an owned file;
3. `d` is a package root (`PackageEntity.path`);
4. `d` is a branch point: at least two child directories `c` have `sub(c) ≠ ∅`.

Consequences: a chain of directories without owned files and with a single populated child collapses
into its deepest member (`src/main/java/com/acme/` becomes one component when only `acme/` has files or
branches); grouping directories such as `packages/` survive because they branch.

- `id = cmp:<path>`; `path` = directory path (`""` for the root).
- `parent` = nearest proper ancestor directory that is a component (absent for the root);
  `children` = components whose parent it is, sorted by id.
- `kind = "package"` if a manifest is declared in the directory, else `"directory"`.
- `name`: for package components, the package's declared name (`PackageEntity.name`; with several
  manifests in one directory, the one with the smallest id); for the root of a repository without a root
  manifest, the repository name; otherwise the directory's path relative to its parent component — equal
  to the directory name except when a chain was collapsed (`presentation/http` in clean-architecture,
  where `src/presentation` has no file and one child). See section 10.
- `packages`: the packages declared in the directory, or else the package owning the directory (nearest
  enclosing manifest), sorted; empty when no manifest encloses it.

### 2.3 Membership, totals, modules, dependencies

- `files` = owned files directly inside the directory, sorted. Because rule 2 makes every directory with
  owned files a component, each owned file belongs to exactly one component (the one of its own directory)
  and `ArchitectureModel.unitOf(file, "component")` is total on `O`.
- `totals` over `sub(d)`: `files = |sub(d)|`, `symbols = Σ |FileEntity.symbols|`,
  `lines = Σ (FileEntity.lines ?? 0)`.
- `modules` = ids of modules owning at least one file of `sub(d)`, sorted (filled after module
  inference).
- `dependencies`/`dependents` = `aggregateDependencies(model, "component", metricsProjectionOptions)`:
  relationships between directly owned files, as the IR specifies.

### 2.4 Monorepos and nested packages

Nothing special is needed: package roots are components by rule 3, and the tree mirrors the directory
tree. Nested manifests (a package inside another package's directory) give nested package components. A
package root whose code lives in `src/` yields a package component with no direct files and a `src`
child; the package component's `totals` summarize the package.

monorepo fixture (prototype output):

```
cmp:                                package    acme-monorepo  direct 0  total 17
└ cmp:packages                      directory  packages       direct 0  total 17   (branch point)
  ├ cmp:packages/api                package    @acme/api      direct 0  total 4
  │ └ cmp:packages/api/src          directory  src            direct 2  total 4
  │   └ cmp:packages/api/src/handlers directory handlers      direct 2  total 2
  ├ cmp:packages/core               package    @acme/core     direct 0  total 5
  │ └ cmp:packages/core/src         directory  src            direct 1  total 5
  │   ├ cmp:packages/core/src/catalog directory catalog       direct 2  total 2
  │   └ cmp:packages/core/src/orders  directory orders        direct 2  total 2
  ├ cmp:packages/shared             package    @acme/shared   direct 0  total 4
  │ └ cmp:packages/shared/src       directory  src            direct 4  total 4
  └ cmp:packages/web                package    @acme/web      direct 0  total 4
    └ cmp:packages/web/src          directory  src            direct 2  total 4
      └ cmp:packages/web/src/components directory components  direct 2  total 2
```

clean-architecture: `cmp:` (package `library-lending`) → `cmp:src` (1 file: `main.ts`) → `application`
(4), `domain` (1; children `domain/model` 4, `domain/ports` 5), `infrastructure` (1; children
`notifications` 1, `persistence` 4) and `presentation/http` (4; collapsed chain).

### 2.5 Edge cases

- No owned files: `components = []`.
- Only root files: a single component `cmp:`.
- A package root without owned files (only `package.json`): not a component (`sub(d) = ∅`); the package
  is still a `PackageEntity`.
- Symbolic links and case-insensitive collisions are resolved by discovery before this step; paths are
  compared by UTF-16 code units.

### 2.6 Complexity

`O(F · D)` time and memory for `F` owned files of maximal depth `D` (one pass over each file's ancestor
chain to count populated children), plus the cost of `aggregateDependencies` (`O(n + m)` on the
component projection).

---

## 3. Modules

### 3.1 Background: architecture recovery by clustering [ESTABLISHED]

- **Bunch / Modularization Quality.** Mancoridis et al. (1998) cast subsystem recovery as a search for the
  partition of the module dependency graph maximizing *Modularization Quality* (MQ), which rewards
  intra-connectivity and penalizes inter-connectivity; Bunch (Mancoridis et al. 1999; Mitchell &
  Mancoridis 2006) explores the search space with hill climbing and genetic algorithms, and lets users
  supply designer knowledge (e.g. fixed groupings, omnipresent modules) that the search must respect. Two
  ideas carry over: *omnipresent* modules (libraries and drivers used everywhere) are set aside before
  clustering, and user constraints override search. Its search is randomized, which conflicts with ADR-007.
- **ACDC** (Tzerpos & Holt 2000a) clusters for comprehension: it first builds a skeleton from *subsystem
  patterns* (such as the body-header pattern and the subgraph-dominator pattern) and then attaches the
  remaining files (orphan adoption); it bounds cluster size and gives clusters meaningful names.
  Katedrala's priors (directories, stems) and pinned utilities follow the same pattern-first philosophy.
- **LIMBO** (Andritsos & Tzerpos 2005) is a scalable hierarchical clustering that minimizes information
  loss and can assess the usefulness of non-structural attributes (e.g. file names, developers) for
  clustering.
- **Comparative studies.** Garcia, Ivkovic & Medvidovic (2013) compared six recovery techniques against
  eight verified ground-truth architectures: two (ARC and ACDC) routinely outperformed the others, but even
  the best had surprisingly low accuracy. Lutellier et al. (2015; extended 2018) evaluated nine techniques
  and variants and concluded that accurate symbol dependencies have a major influence on recovery quality
  and that more accurate techniques are needed. Wu, Hassan & Holt (2005) compared six clustering
  algorithms across successive versions on *stability*, *authoritativeness* and *extremity of the cluster
  distribution* and concluded that automatic clustering needed significant improvement to support evolving
  systems. Tzerpos & Holt (2000b) define stability: small changes in the input should produce small
  changes in the output.
- **Lexical signals.** Anquetil & Lethbridge (1999) cluster files by their names alone; Kuhn, Ducasse &
  Gîrba (2007) partition systems by shared vocabulary (latent semantic indexing) and report that the
  topics mostly correspond to application concepts and architectural components; Corazza et al. (2016)
  weigh lexical information from different parts of the code for clustering. These support file-name
  stems as a prior, used together with dependencies rather than alone.
- **Community detection.** Modularity (Newman & Girvan 2004) with a resolution parameter γ (Reichardt &
  Bornholdt 2006) is optimized by Louvain (Blondel et al. 2008). Modularity has a resolution limit: it may
  fail to separate modules smaller than a scale set by the size of the whole network (Fortunato &
  Barthélemy 2007). Louvain can return badly connected or even disconnected communities; Leiden adds a
  refinement phase that guarantees connected communities (Traag, Waltman & van Eck 2019).
  `@katedrala/graph.louvain` is a deterministic Louvain with warm starts and a split of disconnected
  communities. Label propagation (Raghavan, Albert & Kumara 2007) assigns each node the label most frequent
  among its neighbours, iterated to a fixed point, in near-linear time.
- **Comparing partitions and clusters.** The adjusted Rand index (Hubert & Arabie 1985) and the Jaccard
  similarity of member sets measure agreement; conductance (cut weight over the smaller side's volume)
  measures cluster isolation (Kannan, Vempala & Vetta 2004).

### 3.2 Design rationale and experiments [KATEDRALA HEURISTIC]

The module view must be (a) faithful to developer intent where intent is visible, (b) able to show where
the logical structure departs from the physical one (ADR-006), (c) stable across commits (diff, history,
rules), and (d) explainable file by file. Three observations drive the design.

1. **Unconstrained modularity clustering scrambles intentional structure.** Louvain (γ = 1, from
   singletons, composition roots and utilities removed) reproduces the features of layered-architecture
   and ambiguous-boundaries, but on clean-architecture it mixes `application`, `domain`, `infrastructure`
   and `presentation` files into dependency-dense groups (e.g. `borrow-book.ts`, `domain/ports/clock.ts`,
   `sql-member-repository.ts` and `system-clock.ts` together), and on tangled-architecture it cuts every
   feature directory into pieces of other features. Neither is what developers call modules, and neither
   is explainable as "this file belongs here because ...".
2. **Unconstrained clustering is unstable** (as Wu et al. 2005 observed). Single-edge perturbation on the
   fixtures — every existing source edge removed in turn, and 40 random file pairs sampled (seeded), those
   that were not already edges added — counting the files whose module changed, after a maximum-overlap
   matching of clusters:

   | fixture | perturbation (cases) | prior-anchored (mean / max / unchanged) | Louvain γ = 1 (mean / max / unchanged) |
   | --- | --- | --- | --- |
   | layered-architecture | remove (51) | 0.08 / 1 / 92% | 3.65 / 8 / 33% |
   | layered-architecture | add (33) | 0.00 / 0 / 100% | 3.42 / 7 / 24% |
   | ambiguous-boundaries | remove (61) | 0.10 / 1 / 90% | 0.64 / 4 / 56% |
   | ambiguous-boundaries | add (36) | 0.06 / 1 / 94% | 0.75 / 5 / 53% |
   | tangled-architecture | remove (97) | 0.00 / 0 / 100% | 5.38 / 12 / 10% |
   | tangled-architecture | add (35) | 0.06 / 1 / 94% | 7.20 / 14 / 9% |
   | clean-architecture | remove (72) | 0.00 / 0 / 100% | 3.32 / 11 / 35% |
   | clean-architecture | add (35) | 0.00 / 0 / 100% | 4.26 / 12 / 20% |

3. **Directories and names are the strongest available statement of intent**, and pattern-based recovery
   (ACDC) did comparatively well in the studies above; yet "directory = module" is the simplification
   ADR-006 rejects. Hence directories and naming stems form the **prior**, and dependency evidence
   **overrides** the prior file by file, only when it is unambiguous (strict majorities, minimum support),
   with every override recorded as evidence.

Louvain keeps one role: splitting a directory too large and flat to be one module (3.8), where no finer
prior exists; there it is warm-started from file-name stems. (With all 23 files of ambiguous-boundaries
flattened into one directory, Louvain at γ = 1 recovers cart, catalog and checkout exactly, misplaced files
included, with `format.ts` alone.)

A **resolution sweep** (co-assignment of a module's members under Louvain at γ ∈ {0.5, 1, 2}) was evaluated
as a stability signal for confidence and **rejected**: on the whole graph it made the signal of modules
*untouched* by a single-edge change move by up to 0.2–0.3 (layered- and tangled-architecture), which breaks
comparability over time; on each module's ego network it was dominated by small-graph effects (γ = 0.5
merges everything, γ = 2 shatters) and scored the clearly correct `catalog` of ambiguous-boundaries 0.29.
The membership margin (3.13) measures the same property locally: how much a member's evidence would have to
change before the member moved.

### 3.3 Algorithm overview

```
for each scope (package, or "" for files outside packages), in id order:
  P0  nodes: source files of the scope minus declared-module files
  P1  prior units: source root, container splitting, directory units, size cap
  P2  organization style per directory group; stem units for layer-organized groups
  P3  structural classes on the prior: utilities, orchestrators (composition roots), facades
  P4  split oversized flat units with Louvain (warm start: stems), merge small pieces
  P5  prior-anchored strict-majority reassignment of unpinned files
  P6  drop empty units; identity (anchor, id, name)
then, over all scopes:
  P7  attach tests and declarations (navigation only)
  P8  entry points, public API, aggregated dependencies
  P9  confidence and evidence
```

### 3.4 P0 — scopes and nodes

- **Scope** of a file = `FileEntity.package` (nearest enclosing manifest), or `""`. Inferred modules never
  span scopes: cross-package structure is the package view's job, and a change in one package cannot alter
  another package's modules. Declared modules may span packages.
- **Nodes** = files of the scope whose role is in `inference.modules.file_roles` (default `[source]`) and
  that no declared module owns. Edges to non-nodes are ignored for membership.
- Empty scope: no modules. A scope with a single node: one root module of size 1.
- Files whose analysis failed, was skipped or is unsupported keep their role and are nodes without edges:
  they stay in their prior unit (placed by location only) and lower its internal-edge-ratio; nothing is
  pretended about their dependencies.

### 3.5 P1 — prior units

1. **Source root.** Start at the scope directory (package path, or `""`); while the directory contains no
   node directly and exactly one child directory has nodes in its subtree, descend
   (`packages/api` → `packages/api/src`).
2. **Descend** from the source root `r`. A directory `d` is *split* when `d = r`, or its kind is
   *container*, or `|nodes(sub(d))| > max_module_files` (default 120) and `d` has a child directory with
   nodes.
   - not split: one **directory unit** with all nodes of the subtree; its kind is the directory's kind
     (`feature`, `layer` or `shared`);
   - split: the nodes directly in `d` form a **root unit** (`d = r`) or a **shared unit** (loose files of
     a container); then descend into each child with nodes, in path order.
3. Every unit records its **prior**: anchor directory, kind and initial member set.

Rationale: features are conventionally the children of the source root or of container directories
(`src/features/*`, `packages/*/src/modules/*`); deeper directories are a feature's internal structure; the
size cap keeps modules at a granularity people can reason about.

Limitations: the cap is a threshold (a directory growing from 120 to 121 nodes splits into its children;
diff then pairs modules by member similarity, `ModuleMatch.similarity`); a feature directory whose name is
in the shared vocabulary (`core/` holding a domain core) is treated as shared unless configured otherwise.

### 3.6 P2 — organization style and stem units

For every split directory `d`, classify its child directories with nodes into *layer* children `L`,
*feature* children `F` and *shared* children `S` (1.4). If `|L| ≥ 2`, give every node `f` below a layer
child `c` a **feature stem**:

- if `f` lies in a sub-directory `c/s/...` whose S-stemmed name is not generic and occurs as a
  sub-directory of at least two layer children, the stem is that of `s` (`controllers/payment/`,
  `services/payment/`);
- otherwise `stem(f)` (1.4), possibly none.

Group the nodes by stem. For each stem keep the union of the connected components of the group's induced
undirected subgraph that contain ≥ 2 files in ≥ 2 different layer children — the **recurrent stems**. Let
`coverage = |files of recurrent stems| / |nodes below layer children|`.

| condition | style (evidence `organization-style`) | effect |
| --- | --- | --- |
| `|L| ≥ 2`, ≥ 1 recurrent stem and `coverage ≥ stem_min_coverage` (0.25) | layer-organized with feature stems | each recurrent stem becomes a **stem unit** `d#stem` (or joins a feature child of `d` whose S-stemmed name equals the stem); its files leave their layer-directory units; the other files stay there |
| `|L| ≥ 2`, otherwise | layer-organized | layer-directory units stay (modules = layers, as in clean-architecture) |
| `|L| ≤ 1`, `|F| ≥ 1` | feature-organized | directory units stay |
| `|L| ≥ 2` and `|F| ≥ 1` | mixed (reported with both counts) | as the first two rows |

The connectivity requirement keeps coincidental names apart: in clean-architecture `loan` occurs in
`domain/model/loan.ts`, `domain/ports/loan-repository.ts` and `presentation/http/loan-routes.ts`, but the
route file does not depend directly on either domain file, so no `loan` module is formed.

Prototype results:

| fixture | group | layer children | recurrent stems | coverage | style |
| --- | --- | --- | --- | --- | --- |
| layered-architecture | `src` | controllers, models, repositories, services | order, payment, user | 14/14 = 1.00 | stems |
| dependency-violations | `src` | controllers, domain, repositories, services | customer, order, refund | 10/11 = 0.91 | stems |
| high-fan-in | `src` | api, jobs, services, storage | email, inventory, order, user | 10/20 = 0.50 | stems |
| express-app | `src` | 8 layer directories | order, user | 10/18 = 0.56 | stems |
| fastify-app | `src` | 7 layer directories | order | 4/8 = 0.50 | stems |
| clean-architecture | `src` | application, domain, infrastructure, presentation | — | 0/24 | layers |
| high-fan-out | `src` | adapters, services | — | 0/21 | layers |
| javascript-commonjs | `src` | routes, services, store, views | — | 0/6 | layers |

### 3.7 P3 — structural classes (on the prior)

Computed on the prior partition (`prior(f)` = the unit of `f` after P2):

- **Utilities** (after Bunch's omnipresent modules): `f` is a utility when its dependents lie in at least
  `utility_min_modules` (3) prior units other than `prior(f)`, or at least 2 when `prior(f)` is a shared or
  root unit. A first pass counts all dependents; the final pass ignores orchestrators as dependents.
- **Orchestrators** (composition roots, application shells), as a fixpoint over files in id order: a file
  that is not a first-pass utility is an orchestrator when it is a declared entry point without dependents,
  or when (i) none of its non-orchestrator dependents lies outside `prior(f)`, (ii) its outgoing evidence to
  non-utilities reaches ≥ 2 other units, (iii) no single unit receives more than 50% of that weight and
  (iv) its own unit receives at most 25%.
- **Facades** (barrels): at least half of `f`'s outgoing projection edges carry the `re-exports` kind.

Orchestrators and utilities are **pinned** (they stay in their prior unit) and **excluded from evidence**
(edges touching them neither vote nor count in cohesion): a composition root imports every feature and
would pull features together; a logger used everywhere would glue all modules into one. Facades are pinned
(a barrel belongs to the directory it fronts) but their edges remain evidence. **Files of shared units are
pinned** as well: putting a file into `shared/` or `common/` is an explicit statement of intent, and moving
a single-user shared file into its user would flip back as soon as a second module used it. Grab-bag
directories are reported through evidence instead (`shared-usage`, `single-user-files`).

### 3.8 P4 — splitting oversized flat units (Louvain)

A unit with more than `max_module_files` nodes that P1 could not split (its nodes lie directly in one
directory, or it is a root or shared unit) is partitioned with

```ts
louvain(G_U, { resolution: 1, initialCommunities: stemLabels })
```

on the unit's induced undirected inference subgraph `G_U` (orchestrators and utilities removed), where
`stemLabels` puts files with equal stems in the same initial community and stemless files in singletons
(labels numbered by first occurrence in node order). `louvain` already splits disconnected communities.
Pieces with fewer than `min_module_files` (3) nodes then merge into the piece they share the largest weight
with (ties: smaller key); pieces without edges to other pieces form a remainder unit keyed by the directory
itself (`mod:<dir>`). The other pieces are keyed `<dir>#<stem>` with their most frequent stem (ties:
lexicographically smallest; pieces processed by decreasing size, then smallest member; a stem already taken
passes to the next most frequent; fallback: the head of the smallest member file).

Rationale and limitations: γ = 1 is standard modularity; the resolution limit matters less because `G_U` is
a single directory's subgraph, not the whole system. A piece's key depends on its stem majority, so a piece
without a dominant stem may be renamed by small changes (diff pairs pieces by member similarity).

### 3.9 P5 — prior-anchored strict-majority reassignment

Let `unit(f)` be the current assignment (initially the prior). For an unpinned node `f`, let `in_U` be the
evidence weight from `f`'s dependents in unit `U`, `out_U` the same for its dependencies, `support_U` the
number of distinct dependents in `U`, and `C = argmax_U in_U` (ties: smallest key). `f` moves from
`P = unit(f)` to `C` when:

1. `C ≠ P`, and `C` is a feature, stem or split-piece unit (never a layer-directory, shared or root unit:
   those are not logical destinations);
2. `in_C > 0.5 · Σ_U in_U` (a strict majority of the evidence of its users);
3. `in_C ≥ move_min_weight` (1.0: at least one runtime dependent, or two type-only ones);
4. `support_C ≥ move_min_support` (2), or ≥ 1 when `P` has a single node (a lone file cannot be held by its
   own unit);
5. `Σ_U out_U = 0`, or `out_C > 0.5 · Σ_U out_U` (it also mostly depends on `C`).

Files are visited in id order, assignments update immediately, and passes repeat until one moves nothing,
at most `max_passes` (50). This is a constrained, deterministic relative of label propagation (Raghavan et
al. 2007): the label is the module, the prior is the initial labelling, and the strict-majority, support and
two-sided conditions make a file move only on unambiguous evidence. Conditions 2 and 5 implement the
fixtures' definition of "mostly"; condition 4 absorbs singleton prior units into the module they serve
(small-cluster merging without a size threshold). Termination is bounded by `max_passes`; move cycles,
possible in principle as for label propagation, stay deterministic.

Worked example (ambiguous-boundaries, `src/catalog/price-calculator.ts`; `server.ts` is an orchestrator and
`common/format.ts` a utility, so neither votes): dependents `catalog: 1.0` (1 file), `checkout: 3.0`
(3 files); dependencies `checkout: 2.0`. `3.0 > 0.5 × 4.0`, `3.0 ≥ 1.0`, support 3 ≥ 2,
`2.0 > 0.5 × 2.0` → moves to checkout. Likewise `cart/shipping-estimator.ts` (in `checkout 2.0`, out
`checkout 2.0`) → checkout, and `checkout/stock-availability.ts` (in `catalog 2.0`, out `catalog 1.5`) →
catalog. No other file qualifies; the result equals the fixture's `logicalModules`.

**Connectivity.** Stem units are connected by construction (P2) and Louvain pieces by the refinement
inside `louvain` (the guarantee Leiden makes, Traag et al. 2019). Directory units are *not* split when
their members are disconnected: the directory is the developers' statement, and the lack of internal
dependencies is reported as a low `internal-edge-ratio` instead (e.g. `src/plugins` of
javascript-commonjs, confidence 0.275).

### 3.10 P6 — identity: anchors, ids and names [KATEDRALA HEURISTIC]

Identity derives from the **prior**, never from the final membership, so files moving in or out of a
module never change its id.

| unit | `anchor` | `id` | `name` |
| --- | --- | --- | --- |
| directory unit `d` | `{ directory: d }` | `mod:<d>` | last segment of `d` |
| root unit at source root `r` | `{ directory: r }` | `mod:<r>` (`mod:.` for the analysis root) | the scope package's declared name without npm scope (`@acme/api` → `api`); the repository name without a package; the last segment of `r` when `r` is neither a container nor the package directory |
| shared unit of container `d` | `{ directory: d }` | `mod:<d>` | last segment of `d` |
| stem unit of group `d` | `{ directory: d, stem }` | `mod:<d>#<stem>` | see below |
| split piece of `d` (P4) | `{ directory: d, stem }` | `mod:<d>#<stem>` | the stem's original spelling |

- **Stem module names.** When the module contains a model-layer file (layer label `model` or `domain`, or
  role `data-model`) whose head is exactly the stem's original token (`models/payment.ts`), the stem names
  an entity and the module takes its plural (`payments`): consonant + `y` → `ies`; `s`, `x`, `z`, `ch`,
  `sh` → `+es`; otherwise `+s`. Otherwise the name is the most frequent original first token among the
  members (ties: smallest), e.g. `refund`, `auth`, `checkout`. Rationale: features named after entities are
  conventionally plural collections (REST resources, NestJS feature modules); mass nouns and gerunds
  (`billing`, `auth`) have no entity file of that name and are not pluralized. The id keeps the stem.
- **Anchor directory and members.** The IR describes the anchor as "the directory most member files
  share". Prior anchors satisfy this on every fixture. When fewer than half of a module's nodes lie under
  its anchor after P5, the id is kept (stability) and an `anchor-drift` evidence entry states the share.
- **Collisions.** Inferred keys are unique by construction (directories are unique, stems are unique per
  group, P4 deduplicates piece stems). When an inferred key equals a declared module's name, `~inferred`
  is appended (IR rule). Display names may repeat (`orders` in two packages); consumers disambiguate by id.
- Units left empty by P5 are dropped; diff pairs them by member similarity.

**Stability analysis.** Adding a file to a feature directory adds it to that module (no id change).
Adding or removing one edge can only change the assignment of files whose majority conditions flip —
typically the edge's endpoints; the prototype measured at most one changed file per single-edge change
(3.2). The non-local effects are the structural classes: one new dependent can make a file a utility
(pinned and removed from evidence), and an orchestrator can lose its status; both are reported as
evidence, and their thresholds count distinct units, not weights. Renaming a directory renames the
modules anchored on it (diff pairs them by member similarity); renaming a file changes no id unless it
changes a stem that defined a stem module. Every pass iterates in id order and every tie is broken by
key, so the output is a pure function of the document.

### 3.11 P7 — tests and declarations (attached files) [KATEDRALA HEURISTIC]

Tests (`role: test`) and declarations (`role: declaration`) never influence inference, but people expect
`payment.service.spec.ts` to appear with its module (navigation, impact on tests, CodeVerse). They are
attached after P6:

1. Candidates: for a test, the modules of the production files it depends on; for a declaration, the
   modules of the files that depend on it.
2. If one module holds a strict majority of the distinct candidate files: that module.
3. Otherwise by location: the module owning the most nodes in the file's directory (ties: smallest id),
   then likewise for each ancestor directory up to the scope directory.
4. Otherwise: no module.

Attached files are listed in `ModuleEntity.files` (their `FileEntity.role` tells them apart). They do not
count in module size, confidence or `publicApi`, and they belong to no layer. The metrics projection
excludes tests by default, so attaching them changes no metric. `inference.modules.attach_tests: false`
keeps tests out of modules; declarations are attached unless `attach_declarations: false`.

### 3.12 P8 — entry points, public API, dependencies [DERIVED]

- `entryPoints`: for declared modules, members matching the module's `entry` globs (6.2), else as for
  inferred modules; for inferred modules, members named `index.*` directly in the anchor directory (the
  adapter's barrel convention) plus facades directly in the anchor directory. Stem modules usually have
  none.
- `publicApi`: members that are the target of a metrics-projection edge whose source belongs to another
  module (sorted).
- `dependencies`/`dependents`: `aggregateDependencies(model, "module", metricsProjectionOptions)` after
  memberships are final.
- `packages`: packages owning member files; `components`: components owning member files (sorted).

### 3.13 P9 — confidence and evidence [KATEDRALA HEURISTIC]

All signals are computed on the inference graph with orchestrators and utilities removed ("evidence
graph"), restricted to node members (attached files excluded). Let `n` be the module's node count.

| signal id | definition | range |
| --- | --- | --- |
| `internal-edge-ratio` | `2·W_in / (2·W_in + W_cut)`, where `W_in` is the undirected weight inside the module and `W_cut` the weight between members and other nodes of the scope. Equals 1 − cut/volume, i.e. 1 − conductance when the module is the smaller side (Kannan et al. 2004). Absent when the members have no evidence edges. | [0, 1] |
| `membership-margin` | mean over members with evidence of `max(0, own − best other)`, where the shares are over the member's dependents (or, when it has none, its dependencies) grouped by module. A local stability measure: a margin of δ means the member's own share would have to fall by δ/2 before another module could tie. | [0, 1] |
| `prior-agreement` | Jaccard similarity between the node members and the prior unit's initial members (1 when no file moved in or out). | [0, 1] |
| `module-size` | `n / (n + 2)`: saturating; 1 file → 0.33, 5 → 0.71, 20 → 0.91. Snapshot-independent. | [0, 1) |
| `shared-usage` | for shared modules: share of members whose dependents (orchestrators ignored) lie in ≥ 2 other modules. | [0, 1] |
| `wiring-share` | for root modules: share of members that are orchestrators, facades or declared entry points. | [0, 1] |

```
confidence = Σ_i weight_i × value_i          (an absent signal contributes 0)
feature / stem / split-piece modules: internal-edge-ratio 0.40, membership-margin 0.25, prior-agreement 0.20, module-size 0.15
layer-directory modules:              internal-edge-ratio 0.50, prior-agreement 0.30, module-size 0.20
shared modules:                       shared-usage 0.50, prior-agreement 0.30, module-size 0.20
root modules:                         wiring-share 0.30, prior-agreement 0.50, module-size 0.20
```

Rationale: cohesion is the primary structural property of a module (Bunch's MQ, modularity); the margin
captures how unambiguous each member's membership is; agreement between the dependency evidence and the
developers' own structure (directory or name stem) is independent corroboration; tiny modules carry
little evidence. An absent signal contributes 0 rather than being renormalized away: a directory whose
files do not depend on each other has no structural support, and its confidence must show it (e.g.
`src/plugins` of javascript-commonjs: 0.275). Weights sum to 1 per kind; every term is reported as an
`Evidence` entry with `value` and `weight`, so `confidence = Σ weight × value` can be checked.

Limitations: the weights are judgement, not fitted (there is no ground-truth corpus for TypeScript
codebases yet); values are comparable across snapshots and repositories because no term is normalized by
a snapshot maximum, but they are not probabilities.

Worked example (layered-architecture, `mod:src#payment`, name `payments`). Evidence graph without `main.ts`
(orchestrator) and `shared/{database,errors,http,logger}.ts` (utilities). Internal weight `W_in = 4.5`
(runtime edges 1.0, type-only 0.5); cut edges: `models/payment.ts → models/user.ts` (0.5),
`services/order.service.ts → services/payment.service.ts` (1.0),
`services/payment-gateway.ts → shared/config.ts` (0.5),
`services/payment.service.ts → services/user.service.ts` (1.0): `W_cut = 3.0`.

| signal | value | weight | contribution |
| --- | --- | --- | --- |
| internal-edge-ratio | 9.0 / 12.0 = 0.750 | 0.40 | 0.300 |
| membership-margin | (1 + 1 + 1 + 1 + 0) / 5 = 0.800 (`payment.service.ts` is used by payments 1.0 and orders 1.0: margin 0) | 0.25 | 0.200 |
| prior-agreement | 5/5 = 1.000 | 0.20 | 0.200 |
| module-size | 5/7 = 0.714 | 0.15 | 0.107 |
| **confidence** | | | **0.807** |

Context evidence (no weight): `organization-style` ("`src` is organized by layer: controllers, models,
repositories and services; file-name stems order, payment and user recur across them and cover 14 of 14
files"), `relocated-files` (files moved in or out by P5, with their `in`/`out` evidence), `single-user-files`
(shared modules: members used by exactly one other module), `anchor-drift`, `pinned-files` (utilities and
orchestrators among the members).

### 3.14 Declared modules

- Configuration (6.2) declares modules by name with file globs (picomatch, relative to the analysis root)
  and optional entry globs. A file matched by several declared modules belongs to the first in
  configuration order, and a `module-overlap` warning diagnostic names the others.
- Declared membership is exact: no inference step adds or removes files. Declared modules have
  `origin: "declared"`, no `anchor`, no `inference`; `id = mod:<name>`.
- Declared files are removed from inference (P0). Inferred modules never contain them, and edges to them
  are not evidence, so an undeclared file used only by a declared module is not pulled into it.
- `inference.modules.when_declared`: `infer-rest` (default) infers modules for the remaining files;
  `none` leaves them unassigned.
- **Requirement for the rules engine** (milestone 8): module selectors and `scope: modules` must match
  declared modules only unless a rule opts in (`include_inferred: true`). Rule violations are a contract
  with the user and must not depend on heuristics. dependency-violations shows why: with `payments` and
  `analytics` declared, inference forms stem modules `customers` (`customer.controller`, `customer.service`,
  `customer.repository`, `domain/customer`), `orders` and `refund`; `customer.controller.ts` uses
  `order.service.ts` and `order.service.ts` uses `customer.service.ts`, so the inferred modules form a
  genuine cycle. The fixture expects `no-module-cycles: 0`, which holds when the rule ranges over declared
  modules (whose only dependency is `payments → analytics`); the inferred cycle remains visible as an
  inferred observation (metrics, anomalies), not as a rule violation.

### 3.15 Pseudo-code

```ts
function inferModules(model, config, components): ModuleEntity[] {
  const declared = declaredModules(model, config);             // exact glob membership
  const declaredFiles = new Set(declared.flatMap((m) => m.files));
  const graph = inferenceGraph(model, config, declaredFiles);  // 1.3; CSR, nodes sorted by id
  const inferred: Unit[] = [];
  for (const scope of scopesInIdOrder(graph)) {                // P0
    const units = priorUnits(scope, config);                   // P1
    applyStemUnits(scope, units, graph, config);               // P2 (records organization style)
    const cls = classify(scope, units, graph, config);         // P3: utilities, orchestrators, facades
    splitOversized(scope, units, graph, cls, config);          // P4: louvain(..., initialCommunities)
    reassign(scope, units, graph, cls, config);                // P5: passes in id order
    inferred.push(...identify(scope, units, declared));        // P6: anchors, ids, names
  }
  attach(model, inferred, declared, config);                   // P7: tests, declarations
  const modules = [...declared, ...inferred].sort(byId);
  fillEntryPointsAndPublicApi(model, modules);                 // P8
  scoreConfidence(inferred, graph);                            // P9
  return modules;   // dependencies/dependents filled once the document's module section is set
}

function reassign(scope, units, g, cls, cfg) {
  for (let pass = 0; pass < cfg.maxPasses; pass++) {
    let moved = false;
    for (const f of scope.nodes) {                              // ascending id
      if (cls.pinned.has(f) || units.of(f).kind === "shared") continue;
      const inW = new Map<UnitKey, number>(), inFiles = new Map<UnitKey, Set<FileId>>();
      const outW = new Map<UnitKey, number>();
      for (const [s, w] of g.evidenceIn(f)) { add(inW, units.of(s).key, w); addSet(inFiles, units.of(s).key, s); }
      for (const [t, w] of g.evidenceOut(f)) add(outW, units.of(t).key, w);
      const totIn = sum(inW), totOut = sum(outW);
      if (totIn === 0) continue;
      const c = argmaxThenSmallestKey(inW);
      const p = units.of(f);
      const minSupport = p.nodeCount >= 2 ? cfg.moveMinSupport : 1;
      if (c !== p.key && units.get(c).isDestination
          && inW.get(c)! > 0.5 * totIn && inW.get(c)! >= cfg.moveMinWeight
          && inFiles.get(c)!.size >= minSupport
          && (totOut === 0 || (outW.get(c) ?? 0) > 0.5 * totOut)) {
        units.move(f, c, { in: inW, out: outW });              // recorded for evidence
        moved = true;
      }
    }
    if (!moved) break;
  }
}
```

### 3.16 Expected results on the fixtures

Prototype output (inference graph from `expected.json` imports; confidences rounded to 3 decimals).

**layered-architecture** — matches `logicalModules`.

| id | name | members | confidence |
| --- | --- | --- | --- |
| `mod:src#payment` | payments | controllers/payment.controller, models/payment, repositories/payment.repository, services/payment-gateway, services/payment.service | 0.807 |
| `mod:src#order` | orders | controllers/order.controller, models/order, models/order-line, repositories/order.repository, services/order.service | 0.888 |
| `mod:src#user` | users | controllers/user.controller, models/user, repositories/user.repository, services/user.service | 0.730 |
| `mod:src/shared` | shared | the five `shared/` files (`shared-usage` 0.80) | 0.843 |
| `mod:src` | shop-backend | `main.ts` (orchestrator) — in none of the four expected modules, as required | 0.867 |

Module dependencies among the four expected modules (aggregated): orders → payments, orders → users,
payments → users and every feature → shared — exactly the fixture's `moduleDependencies`; shared depends
on no feature. The root module `shop-backend` additionally depends on all four.

**ambiguous-boundaries** — matches `logicalModules` (`src/common/*` and `src/server.ts` unconstrained).

| id | name | members | confidence |
| --- | --- | --- | --- |
| `mod:src/cart` | cart | 5 cart files (`shipping-estimator.ts` moved out) | 0.844 |
| `mod:src/catalog` | catalog | 6 catalog files + `checkout/stock-availability.ts` (`price-calculator.ts` moved out) | 0.801 |
| `mod:src/checkout` | checkout | 9 checkout files + `cart/shipping-estimator.ts` + `catalog/price-calculator.ts` | 0.894 |
| `mod:src/common` | common | format, session, slug, validation; `shared-usage` 1/4 = 0.25, `single-user-files`: session (cart), slug (catalog), validation (checkout) | 0.558 |
| `mod:src` | coffee-shop | `server.ts` (orchestrator) | 0.867 |

The three relocations are exactly the fixture's `misplaced` list, each with the `misplacementEvidence`
counts as `relocated-files` evidence; the grab-bag finding ("only `format.ts` is genuinely shared") is the
`shared-usage` and `single-user-files` evidence of `common`.

**tangled-architecture** — modules equal the feature directories (no file has unambiguous majority
evidence elsewhere), with visibly lower confidence than in the clean fixtures: cart 0.551, catalog 0.644,
checkout 0.548, customers 0.576, inventory 0.695 (internal-edge-ratio 0.39–0.73, margins 0.21–0.40); `lib`
(shared, 3 utilities) 0.920; `src` (`main.ts`) 0.867. The tangle is reported by metrics and anomalies on
these modules (directory cycle), not hidden by re-clustering.

**clean-architecture** — layer-organized without recurring stems: modules `application` (0.551),
`domain` (0.780), `infrastructure` (0.600), `presentation` (0.797) and the root `library-lending`
(`main.ts`, 0.867). Low internal-edge-ratio of `application` (0.235) correctly reflects that use cases
mostly talk to the domain.

**monorepo** — one scope per package; no module spans packages: `@acme/api` → `api` (`routes.ts`,
`server.ts`), `handlers`; `@acme/core` → `core` (`index.ts`), `catalog`, `orders`; `@acme/shared` → `shared`
(4 files); `@acme/web` → `web` (`App.tsx`, `main.tsx`), `components`.

**dependency-violations** (with its configuration) — declared `payments` and `analytics` exactly as
`declaredModules`; inferred: `mod:src#customer` "customers" (0.751), `mod:src#order` "orders" (0.680),
`mod:src#refund` "refund" (0.725), `mod:src/repositories` (`database.ts`, 0.367), `mod:src` (`main.ts`,
`config.ts`, 0.750). See 3.14 for the rule scope requirement.

**Others** (summary): nestjs-app — `orders`, `payments` (feature directories), `common`, `config`
(shared), root `payments-service` (`app.module.ts` orchestrator, `app.controller.ts`, `main.ts`);
express-app — stem modules `orders`, `users` plus layer-directory modules for unmatched layer files and the
root; typescript-features — `billing`, `customers`, `orders`, `ui`, `utils`, `shared` and the root;
javascript-commonjs — layer-directory modules with low confidence (few internal edges).

Disagreements with fixture wording: none on membership. The layered fixture names its modules `payments`,
`orders`, `users`; this design produces those names through the entity-plural rule (3.10), while the ids
keep the stems (`mod:src#payment`). Fixture tests should compare memberships for listed files only (unlisted
files are unconstrained) and names as listed.

---

## 4. Layers

### 4.1 Background [ESTABLISHED]

- **Levelization** (Lakos 1996): in a system with acyclic physical dependencies, every component gets a
  level — components without dependencies inside the system are level 1, and a component's level is one
  more than the highest level it depends on (a longest-path layering); cycles must be broken before levels
  exist.
- **Layer recovery and layering violations.** Sarkar, Maskeri & Ramachandran (2009) discover layers from
  source code and define indices measuring how far a layered organization departs from the layering
  principle (e.g. dependencies pointing back up). Laval et al. (2013, oZone) identify layers in the
  presence of cyclic dependencies: detect cycles, break them with heuristics that choose the dependencies
  most likely to be violations, then layer the remainder.
- **Feedback arc sets.** Making a directed graph acyclic by removing a minimum set of arcs is NP-complete
  (Karp 1972); Eades, Lin & Smyth (1993) give a fast greedy heuristic (implemented by
  `greedyFeedbackArcSet`).
- **The Dependency Rule** of Clean Architecture (Martin 2017): source code dependencies point inwards,
  toward higher-level policy; the domain is the centre and frameworks/adapters are the outer ring.

### 4.2 Architectural roles per file [KATEDRALA HEURISTIC]

Inputs, by source precedence:

| source | produces | confidence |
| --- | --- | --- |
| `configuration` | `inference.roles: { <role>: [globs] }` (6.3) | 1.0 |
| framework detector (`nestjs`, `express`, ... — later milestones) | `RoleEntry` with its own confidence | as given |
| `naming` | dotted qualifier `payment.controller.ts` | 0.8 |
| `naming` | word suffix of the file head (`PaymentController.ts`, `payment-controller.ts`) or of the file's exported class name (`export class PaymentController`) | 0.6 |
| `location` | the outermost layer-named directory between the source root and the file (`src/domain/model/book.ts` → `domain`) | 0.7 |

Role vocabulary (naming suffix → `ArchitecturalRole`): `controller` → `http-controller`; `route(s)`,
`router` → `route-definition`; `middleware`, `guard`, `interceptor` → `middleware`; `service` →
`service`; `repository`, `repo` → `repository`; `entity`, `model` → `data-model`; `dto` →
`data-transfer-object`; `client` → `external-client`; `module` → `module-definition`; `store` →
`state-store`; `page` → `ui-page`; `component` → `ui-component`.

Naming and location roles are written to `FileEntity.roles` as `RoleEntry { role, confidence, source:
"naming" | "location" | "configuration", evidence }` (one entry per role and source; evidence signals
`name-qualifier`, `name-suffix`, `type-name-suffix`, `directory-name`, `configured-glob`). A location vote
whose directory has no `ArchitecturalRole` (`domain`, `application`, `infrastructure`, `presentation`,
`ports`, `adapters`, ...) is a *layer vote* only and produces no `RoleEntry`.

### 4.3 Layer labels and the partition

Role → layer (default vocabulary; configurable):

| role | layer | role | layer |
| --- | --- | --- | --- |
| `http-controller` | `controller` | `data-model` | `model` |
| `route-definition` | `route` | `data-transfer-object` | `dto` |
| `middleware` | `middleware` | `external-client` | `client` |
| `service` | `service` | `ui-page` | `page` |
| `repository` | `repository` | `ui-component` | `component` |
| `state-store` | `store` | `module-definition`, `configuration-provider`, `utility`, `x-*` | no layer (cross-cutting) |

Directory → layer (S-stemmed, lower-cased names): `controller` → controller; `route`, `router`,
`routing` → route; `handler` → handler; `resolver` → resolver; `middleware`, `guard`, `interceptor` →
middleware; `view` → view; `page`, `screen` → page; `component` → component; `presentation`, `ui`, `web`,
`http` → presentation; `api`, `rest`, `graphql`, `endpoint` → api; `service` → service; `usecase`,
`use-case`, `interactor`, `application` → application; `domain` → domain; `model`, `entity` → model;
`schema` → schema; `dto` → dto; `repository`, `repo`, `dao`, `persistence` → repository; `db`, `database` →
database; `data` → data; `storage` → storage; `store` → store; `client` → client; `gateway` → gateway;
`integration` → integration; `adapter` → adapter; `port` → port; `infrastructure`, `infra` →
infrastructure; `job`, `worker`, `task`, `cron` → job; `hook` → hook; `listener`, `subscriber` →
listener; `command` → command.

**Partition rule.** For each `source` file (any module, declared or not — layers are orthogonal to
modules; tests and declarations never get a layer): collect votes `(label, confidence, source)`; a role
mapping to "no layer" votes for the label ⊥. Score each label by noisy-OR, `s(L) = 1 − Π(1 − c_i)` over
its votes (the noisy-OR combination, Pearl 1988, used here as a scoring rule, not as a probability model).
The file's label is the highest score; ties go to the label whose strongest vote has the higher source
precedence (configuration > detector > naming > location), then to the smaller name. The file joins layer
`L` when `L ≠ ⊥` and `s(L) ≥ min_label_score` (0.5). Example: `controllers/user.service.ts`: location →
controller 0.7, naming → service 0.8: service wins (a misplaced service is still a service); with an
agreeing `UserService` class name the service score is `1 − 0.2 × 0.4 = 0.92`.

**Pruning.** A label keeps its layer if it has ≥ `min_layer_files` (2) members, or ≥ 1 member with a
location, configuration or detector vote for it (a deliberate `routes/` directory with one file is a
layer; one stray `x.controller.ts` is not). When fewer than two layers remain, there are no inferred
layers. Files directly in shared directories or composition roots have no votes and therefore no layer
(`src/shared/*` and `src/main.ts` in layered-architecture, as the fixture requires).

### 4.4 Rank

**Declared layers** (6.3) take their rank from configuration (list position, or explicit `rank`, ties
allowed); when layers are declared, no layer is inferred and undeclared files have no layer.

**Inferred layers:**

1. **Layer graph** `H`: nodes are layers (sorted by name); arc weight `w(A, B)` = Σ over distinct file
   pairs `u ∈ A`, `v ∈ B` with a file-projection edge `u → v` of 1.0 (runtime) or 0.5 (type-only), on all
   source files.
2. **Cycles.** `stronglyConnectedComponents(H)`. For every non-trivial SCC with `k ≤ 12` layers, find the
   linear order minimizing the weight of backward arcs exactly, by dynamic programming over subsets
   (`O(2^k · k²)`; k = 12 is about 600 000 steps). Ties: fewest inversions of the conventional tiers
   (below), then the lexicographically smallest sequence of names. For `k > 12`, `greedyFeedbackArcSet`
   (Eades et al. 1993; unweighted, a documented approximation). Removed arcs are the **upward
   dependencies** (evidence; candidates for the `upward-dependency` anomaly in milestone 7).
3. **Conventional arcs** for incomparable layers: for every pair `(A, B)` with conventional tiers
   `tier(A) < tier(B)`, sharing at least one package, where neither reaches the other in the acyclic graph,
   add `A → B` with weight 0 when it creates no cycle; pairs are processed by `(tier(A), tier(B), A, B)`.
   Conventional tiers (outer → inner): 0 `route`, `page`; 1 `controller`, `handler`, `resolver`, `view`,
   `api`, `presentation`, `middleware`, `job`, `listener`, `command`; 2 `component`, `service`,
   `application`, `hook`, `store`; 3 `domain`, `repository`, `gateway`, `client`; 4 `database`, `storage`,
   `data`, `model`, `dto`, `schema`. `infrastructure`, `adapter`, `port` and `integration` have no tier:
   their direction differs between classic layering (infrastructure at the bottom) and
   ports-and-adapters (adapters outside), so only observed dependencies place them.
4. **Rank** = `longestPathLengths(D, "in")`: the length of the longest path from a layer nothing depends
   on (rank 0, outermost) to the layer — Lakos levelization counted from the top.

**Classic vs. clean architecture.** Rank is defined by dependency direction only: dependencies are
expected to point to higher ranks. In classic layering (controller → service → repository → model) the
data layer gets the highest rank; in clean/hexagonal architecture the domain does, and every adapter ring
that nothing depends on — presentation *and* infrastructure — gets rank 0. Counting from the top (rather
than from the bottom as Lakos does) is what puts infrastructure in the outer ring with presentation instead
of next to the use cases; with levels counted from the bottom it would share rank 1 with `application`.
An "upward" dependency is a dependency toward a lower rank in both styles, so the dependency rule of
Clean Architecture and the classic layering rule are the same check.

### 4.5 Layer confidence and evidence [KATEDRALA HEURISTIC]

| signal id | definition | weight |
| --- | --- | --- |
| `label-agreement` | mean over members of their winning label score | 0.35 |
| `direction-consistency` | share of the layer's incident cross-layer weight that follows the rank order (outgoing to higher rank, incoming from lower rank); absent without cross-layer dependencies | 0.35 |
| `order-support` | share of the other layers comparable with this layer through observed (non-removed, non-conventional) dependency paths | 0.20 |
| `layer-size` | `n / (n + 2)` | 0.10 |

`confidence = Σ weight × value` (absent signals contribute 0). Context evidence: `upward-dependencies`
(count, weight, example files), `conventional-order` (which neighbours were placed by convention),
`role-sources` (members per source), `misplaced-by-name` (files whose name says another layer than their
directory).

Worked example (layered-architecture, `layer:controller`): 3 files, each with a location vote 0.7 and a
`.controller` qualifier 0.8 → `1 − 0.3 × 0.2 = 0.94`; all incident weight is outgoing to `service`
(rank 1): 1.0; comparable with service, repository, model through observed paths: 3/3 = 1.0; size 3/5 = 0.6.
`0.35 × 0.94 + 0.35 × 1 + 0.20 × 1 + 0.10 × 0.6 = 0.939`.

Reason template: "`src/controllers` holds 3 files named `*.controller.ts`; nothing depends on this layer
and it depends on `service` (rank 0)."

### 4.6 Expected results on the fixtures

| fixture | layers (rank: name, confidence) | notes |
| --- | --- | --- |
| layered-architecture | 0 controller 0.939; 1 service 0.925; 2 repository 0.939; 3 model 0.862 | layer dependencies exactly controller → service, service → repository, service → model, repository → model; `shared/*` and `main.ts` in no layer; no upward arc |
| clean-architecture | 0 infrastructure 0.737; 0 presentation 0.795; 1 application 0.795; 2 domain 0.878 | presentation < application < domain as expected; infrastructure in the outer ring (depends only on domain); `main.ts` in no layer; the four expected layer dependencies, none upward |
| nestjs-app | 0 controller; 1 middleware; 2 service; 3 dto, model | guards/interceptors are used by controllers and therefore rank below them |
| express-app | 0 route; 1 controller, middleware; 2 service; 3 client, repository; 4 database, model | controllers reach services only through `container.ts` (no layer), so controller → service is placed by convention (`conventional-order` evidence; `order-support` of controller 0.43) |

The layered fixture lists layer names as directory names (`controllers`, ...) and explicitly allows role
names; this design uses the singular vocabulary names. For clean-architecture the fixture's `layers` list
omits `infrastructure`; tests should assert the rank order of the listed layers and `rank(infrastructure)
< rank(domain)`.

### 4.7 Edge cases

No source files, or fewer than two layers after pruning: `layers = []`. All layers in one SCC: the exact
or greedy ordering decides, and every removed arc is reported. Layers without any dependency: rank by
conventional arcs, else all rank 0 (ties), with low `order-support`. Monorepos: one global set of layers
(`layer:<name>`); conventional arcs only between layers that share a package, observed arcs from any
package.

---

## 5. Evidence, reasons and explanation formats

### 5.1 Conventions

- Components are derived: no `InferenceInfo`. Their explanation is structural (directory, package,
  totals, collapsed chain if any).
- `InferenceInfo.method`: `katedrala/module-inference@1`, `katedrala/layer-inference@1`. When any
  inference parameter differs from its default, the method string carries the non-default parameters in
  query form, keys sorted: `katedrala/module-inference@1?max_module_files=200&type_only_weight=0`. Diff
  compares method strings for comparability ("module inference parameters differ"), with no IR change.
- `InferenceInfo.evidence`: weighted signals first, by decreasing contribution `weight × value`, ties by
  `signal`; then unweighted context signals by `signal`. Values and confidences are rounded to six decimals
  (ADR-007) after computing `confidence = Σ weight × value` from unrounded values; recomputation from the
  rounded values agrees within 5·10⁻⁶.
- `Evidence.entities`: sorted by id, truncated to `limits.maxEvidenceEntities`.
- `description`: one complete sentence with the numbers, generated from a fixed template per signal (no
  free text), so documents stay byte-for-byte deterministic.

### 5.2 Module signal catalogue

| signal | weight (feature kinds) | template | entities |
| --- | --- | --- | --- |
| `internal-edge-ratio` | 0.40 | "75% of the dependency weight of member files stays inside the module (internal 4.5, crossing 3.0)." | — |
| `membership-margin` | 0.25 | "On average, member files are 80 percentage points more connected to this module than to any other; 1 of 5 members is contested." | contested members |
| `prior-agreement` | 0.20 | "The members match the file-name stem `payment` across 4 layer directories exactly (Jaccard 1.00)." / "... match directory `src/catalog` except 2 relocated files (Jaccard 0.75)." | relocated files |
| `module-size` | 0.15 | "The module has 5 member files." | — |
| `shared-usage` | 0.50 (shared) | "1 of 4 files is used by two or more other modules." | shared files |
| `wiring-share` | 0.30 (root) | "1 of 1 files is a composition root, barrel or declared entry point." | those files |
| `organization-style` | — | "`src` is organized by layer (controllers, models, repositories, services); stems order, payment and user recur across them and cover 14 of 14 files." | layer directories |
| `relocated-files` | — | "`src/catalog/price-calculator.ts` was moved here: 3 of its 4 dependents (weight 3.0 of 4.0) and all of its dependencies (2.0 of 2.0) are in this module." (one entry per relocated file, up to the entity limit) | the file |
| `single-user-files` | — | "3 files are used by only one module: session (cart), slug (catalog), validation (checkout)." | those files |
| `pinned-files` | — | "`src/main.ts` is a composition root and was not moved or counted as evidence." | those files |
| `anchor-drift` | — | "Only 40% of member files lie under the anchor directory `src/x`." | — |

Reason templates (`InferenceInfo.reason`, one sentence):

- stem module: "Files named `payment.*` in 4 layer directories form a connected group; 75% of their
  dependency weight stays inside."
- directory module: "Directory `src/catalog` with 1 file relocated in and 1 out; 85% of the dependency
  weight stays inside."
- layer-directory module: "Layer directory `src/domain` in a layer-organized source tree; no feature
  stems recur across its layers."
- shared module: "Shared directory `src/common`: 1 of 4 files is used by two or more modules."
- root module: "Top-level files of `src`: composition root and wiring."
- split piece: "Part of the oversized directory `src/lib` (420 files), grouped by dependencies around the
  stem `format`."

### 5.3 Layer evidence

Weighted: `label-agreement`, `direction-consistency`, `order-support`, `layer-size` (4.5). Context:
`role-sources` ("3 members by location and naming, 1 by location only"), `upward-dependencies` ("2 file
dependencies (weight 1.5) point from `repository` to `service`, against the inferred order"),
`conventional-order` ("The order relative to `service` follows the conventional order; no dependency path
connects them"), `misplaced-by-name`.

### 5.4 Explanation report

`katedrala explain <module|layer>` (milestone 11) renders `ExplanationReport.inference` as:

```
payments  (mod:src#payment, inferred, confidence 0.81)
  Files named payment.* in 4 layer directories form a connected group; 75% of their dependency weight
  stays inside.
  0.300  internal-edge-ratio   0.750 × 0.40   75% of the dependency weight ... stays inside
  0.200  membership-margin     0.800 × 0.25   1 of 5 members is contested: services/payment.service.ts
  0.200  prior-agreement       1.000 × 0.20   matches stem `payment` across 4 layer directories
  0.107  module-size           0.714 × 0.15   5 member files
         organization-style                   src is organized by layer; stems order, payment, user ...
```

---

## 6. Configuration

Keys are snake_case (ADR-010). `@katedrala/inference` registers validators for the top-level `modules`,
`layers` and `inference` sections (reserved in `RESERVED_CONFIGURATION_SECTIONS`). Unknown keys are errors.

### 6.1 Example

```yaml
modules:                                   # declared modules
  payments: ["src/payments/**"]            # short form: file globs
  analytics:                               # long form
    files: ["src/analytics/**"]
    entry: ["src/analytics/index.ts"]
layers:                                    # declared layers, outermost first (disables layer inference)
  - name: controller
    files: ["src/controllers/**"]
  - name: service
    files: ["src/services/**"]
  - name: repository
    files: ["src/repositories/**"]
    rank: 2                                # optional; default = position; equal ranks allowed
inference:
  roles:                                   # configured architectural roles (RoleEntry source "configuration")
    http-controller: ["src/**/*.handler.ts"]
  components:
    file_roles: [declaration, generated, script, source, test]
  modules:
    max_module_files: 200
    shared_directories: ["platform", "!core"]   # extend defaults; "!" removes a default
  layers:
    directory_layers: { endpoints: controller, usecases: application }
```

### 6.2 `modules` (declared)

| key | type | meaning |
| --- | --- | --- |
| `<name>` | glob list, or `{ files: glob list, entry?: glob list }` | module name (no `#` or `~`, unique); files matching `files` (picomatch, relative to the analysis root); `entry` globs give `entryPoints` |

Overlaps: first module in configuration order wins, `module-overlap` warning diagnostic.

### 6.3 `layers` (declared) and `inference`

| key | type | default | meaning |
| --- | --- | --- | --- |
| `layers[].name` | string | — | layer name (`layer:<name>`) |
| `layers[].files` | glob list | — | members (first matching layer wins; `layer-overlap` warning) |
| `layers[].rank` | integer ≥ 0 | list position | expected order, 0 outermost |
| `inference.roles.<role>` | glob list | `{}` | files with that `ArchitecturalRole` (confidence 1) |
| `inference.components.file_roles` | FileRole list | `[declaration, generated, script, source, test]` | files owned by components |
| `inference.modules.enabled` | boolean | `true` | infer modules |
| `inference.modules.when_declared` | `infer-rest` \| `none` | `infer-rest` | inference for undeclared files when modules are declared |
| `inference.modules.file_roles` | FileRole list | `[source]` | nodes of the inference graph |
| `inference.modules.type_only_weight` | number in [0, 1] | 0.5 | weight of type-only file pairs |
| `inference.modules.min_edge_confidence` | number in [0, 1] | 0.5 | edges below are not evidence |
| `inference.modules.max_module_files` | integer ≥ 2 | 120 | size cap of directory units (P1, P4) |
| `inference.modules.min_module_files` | integer ≥ 1 | 3 | smallest Louvain piece (P4) |
| `inference.modules.stem_min_coverage` | number in [0, 1] | 0.25 | stem organization threshold (P2) |
| `inference.modules.utility_min_modules` | integer ≥ 2 | 3 | utility threshold (P3) |
| `inference.modules.move_min_support` | integer ≥ 1 | 2 | distinct supporting dependents (P5) |
| `inference.modules.move_min_weight` | number > 0 | 1.0 | minimum supporting weight (P5) |
| `inference.modules.max_passes` | integer ≥ 1 | 50 | reassignment passes (P5) |
| `inference.modules.attach_tests` | boolean | `true` | attach tests to modules (P7) |
| `inference.modules.attach_declarations` | boolean | `true` | attach declarations (P7) |
| `inference.modules.container_directories` | string list | 1.4 | extends defaults; `!name` removes |
| `inference.modules.shared_directories` | string list | 1.4 | extends defaults; `!name` removes |
| `inference.modules.generic_tokens` | string list | 1.4 | extends defaults; `!name` removes |
| `inference.layers.enabled` | boolean | `true` | infer layers (ignored when `layers` is declared) |
| `inference.layers.directory_layers` | map name → layer \| null | 4.3 | merged over defaults; `null` removes |
| `inference.layers.role_layers` | map role → layer \| null | 4.3 | merged over defaults; `null` = no layer |
| `inference.layers.naming_suffixes` | map suffix → role \| null | 4.2 | merged over defaults |
| `inference.layers.conventional_tiers` | list of name lists | 4.4 | replaces the default tiers |
| `inference.layers.min_label_score` | number in [0, 1] | 0.5 | minimum label score |
| `inference.layers.min_layer_files` | integer ≥ 1 | 2 | layer pruning |
| `inference.layers.exact_order_max_layers` | integer in [2, 16] | 12 | exact ordering bound |

---

## 7. Complexity and scale

`F` files, `n` inference nodes, `m` inference edges, `D` maximal directory depth, `U` units. Target: 100 000
files and 1 000 000 edges.

| step | time | memory | notes |
| --- | --- | --- | --- |
| components | `O(F · D)` | `O(F + dirs)` | plus `aggregateDependencies` `O(n + m)` |
| inference graph | `O(n + m)` | `O(n + m)` | from the cached file projection; weights in a `Float64Array` CSR, both directions |
| P1 prior units | `O(n · D)` | `O(n)` | subtree counts by one pass over ancestor chains |
| P2 stems | `O(n + m)` | `O(n)` | tokenization `O(Σ name length)`; union–find per stem group |
| P3 classes | `O(n + m)` per fixpoint round | `O(n)` | distinct-unit counts with a per-file marker array; rounds ≤ 3 in practice |
| P4 Louvain | `O(m_U log m_U)` per pass per oversized unit | `O(n_U + m_U)` | units are ≤ a few thousand nodes |
| P5 reassignment | `O(passes · (n + m))` | `O(n + U)` | per file: accumulate unit weights from CSR rows into a sparse accumulator; typical passes 1–3 |
| P7 attach | `O(F_attached + m_attached)` | `O(F)` | |
| P9 confidence | `O(n + m)` | `O(U)` | one pass over edges accumulating `W_in`, `W_cut` per unit; margins per file |
| layers | `O(F + m + 2^k k²)` | `O(F + L²)` | `L` layers (tens); `k ≤ 12` |

At 1 000 000 edges, each pass is a few linear scans of typed arrays (tens of milliseconds in V8); the
overall step is dominated by building projections, which the model caches and shares with metrics. Nothing
is quadratic in `n`: the prototype's per-file scans over all edges become CSR row scans. No approximation is
needed; the only bounded searches are `max_passes` and the exact layer ordering (`k ≤ 12`, greedy beyond).

---

## 8. Determinism

- No randomness anywhere (Louvain is deterministic and warm-started; no sampling).
- Every iteration runs over sorted ids (UTF-16 code-unit order): scopes, directories, files, units,
  stems, candidate units; every argmax breaks ties by the smallest key; fixpoints and passes visit files in
  id order.
- Sums are accumulated in edge order of the CSR (sorted by source, then target), so floating-point
  results do not depend on document array order; outputs are rounded to six decimals.
- Outputs are pure functions of the document and the configuration; method strings record non-default
  parameters (5.1).

---

## 9. Test plan

### 9.1 Unit tests

- Lexical: tokens (camel case, acronyms, separators), S-stemmer table (`payments` → `payment`,
  `categories` → `category`, `addresses` → `address`, `status` kept, `bus` kept), stems with role and
  generic tokens, entity plural rule (`payment` → `payments`, `category` → `categories`, `address` →
  `addresses`, `auth` unchanged without an entity file).
- Components: collapsed chains, branch points without files, package roots without code, nested
  packages, several manifests in one directory, names of collapsed chains, totals equal to sums.
- Each phase P1–P7 on hand-built graphs: container splitting and size cap; stem connectivity and
  coverage threshold (just below and above 0.25); utility/orchestrator/facade thresholds at their
  boundaries; each of the five move conditions failing alone; singleton absorption; Louvain split with
  warm start and small-piece merging; attachment majority, location fallback, unassigned.
- Confidence: hand-computed examples (3.13, 4.5); `confidence = Σ weight × value` within 5·10⁻⁶; weights
  sum to 1 per kind.
- Layers: noisy-OR scores and tie precedence; pruning; exact ordering DP against brute force on random
  small graphs (k ≤ 7, seeded); greedy fallback beyond the bound; conventional arcs never create cycles;
  rank = longest path.

### 9.2 Property tests (fast-check, seeded)

- **Determinism**: shuffling every array of the input document (files, edges, directories, packages)
  yields byte-identical `components`, `modules`, `layers` and `FileEntity.roles`.
- **Partition invariants**: every owned file is in exactly one component; component `files` partition the
  owned files; `totals` equal the sums over the subtree; parent/children consistent; every inference node
  is in exactly one module; declared modules equal their glob matches; no inferred module contains a
  declared file; inferred modules never span packages; every file is in at most one layer; tests and
  declarations are in no layer.
- **Identity**: module ids are unique; `anchor` is consistent with the id; ids do not change when a
  file moves between existing modules.
- **Locality**: adding an edge between two files of the same module changes no assignment; adding a
  package changes no module of other packages; renaming an unrelated directory changes no other module.
- **Idempotence**: declaring the inferred modules as configuration reproduces the same memberships.
- **Path invariance**: prefixing every path with `x/` changes ids only by the prefix.
- **Bounded perturbation** on fixtures: removing any single edge changes the module of at most 2 files
  (prototype: at most 1).

### 9.3 Fixture expectations

| fixture | assertions |
| --- | --- |
| layered-architecture | `logicalModules` (memberships of listed files and names), `main.ts` in none of them, `moduleDependencies` among them, layer ranks controller < service < repository < model, `layerDependencies`, `shared/*` and `main.ts` in no layer |
| ambiguous-boundaries | `logicalModules` for listed files; the relocated files are exactly `misplaced`, with `relocated-files` evidence matching `misplacementEvidence`; `common` has `single-user-files` = session, slug, validation |
| tangled-architecture | modules equal the five feature directories plus `lib` and the root; each feature confidence < 0.75 |
| clean-architecture | modules equal the four layer directories plus the root; layer ranks presentation < application < domain and infrastructure < domain; layer dependencies exactly as listed; no upward arc |
| monorepo | component tree as in 2.4; one root module per package; no module spans packages |
| dependency-violations | declared modules exactly `declaredModules`; inferred modules contain no declared file; rule `no-module-cycles` yields 0 (declared scope) |
| nestjs-app, express-app, fastify-app | layers and ranks as in 4.6; roles from naming match the expected controllers/services |
| all | golden documents (ADR-007): `components`, `modules`, `layers` sections byte-identical |

### 9.4 Scale test

A synthetic repository (100 000 files in 500 feature directories with 50 layer-organized groups, 1 000 000
edges, fixed seed) must complete inference within the milestone 13 budget, with memory linear in `n + m`.

---

## 10. IR impact

No schema change is required. Two documentation clarifications:

1. **`ModuleAnchor.directory`** ("the directory most member files share"): specify it as the directory of
   the module's prior (the directory unit, or the group directory of a stem module), which contains most
   members by construction and is kept when relocations drift membership (with `anchor-drift` evidence),
   so identities are stable.
2. **`ComponentEntity.name`** ("directory name"): for a directory component whose parent component is not
   its parent directory (a collapsed chain), the name is the path relative to the parent component
   (`presentation/http`).

Cross-milestone requirements recorded here: the rules engine treats `scope: modules` and module selectors
as declared modules unless a rule opts into inferred ones (3.14); anomalies consume `relocated-files`,
`single-user-files` and `upward-dependencies` evidence; diff uses `InferenceInfo.method` (with parameters)
for comparability.

---

## 11. References

All references were verified for this design (bibliographic records found by web search, or local copies
of the papers); details and verification notes are in the design's `refs.md`.

- Andritsos, P. & Tzerpos, V. 2005. "Information-Theoretic Software Clustering". IEEE Transactions on
  Software Engineering 31(2).
- Anquetil, N. & Lethbridge, T. C. 1999. "Recovering software architecture from the names of source
  files". Journal of Software Maintenance: Research and Practice 11(3):201–221.
- Blondel, V. D., Guillaume, J.-L., Lambiotte, R. & Lefebvre, E. 2008. "Fast unfolding of communities in
  large networks". Journal of Statistical Mechanics: Theory and Experiment P10008.
- Corazza, A., Di Martino, S., Maggio, V. & Scanniello, G. 2016. "Weighing lexical information for software
  clustering in the context of architecture recovery". Empirical Software Engineering 21(1):72–103.
- Eades, P., Lin, X. & Smyth, W. F. 1993. "A fast and effective heuristic for the feedback arc set problem".
  Information Processing Letters 47(6):319–323.
- Fortunato, S. & Barthélemy, M. 2007. "Resolution limit in community detection". Proceedings of the
  National Academy of Sciences 104(1):36–41.
- Garcia, J., Ivkovic, I. & Medvidovic, N. 2013. "A comparative analysis of software architecture recovery
  techniques". 28th IEEE/ACM International Conference on Automated Software Engineering (ASE).
- Harman, D. 1991. "How effective is suffixing?". Journal of the American Society for Information Science
  42(1):7–15.
- Hubert, L. & Arabie, P. 1985. "Comparing partitions". Journal of Classification 2:193–218.
- Kannan, R., Vempala, S. & Vetta, A. 2004. "On clusterings: Good, bad and spectral". Journal of the ACM
  51(3):497–515.
- Karp, R. M. 1972. "Reducibility among combinatorial problems". In Miller, R. E. & Thatcher, J. W. (eds.),
  Complexity of Computer Computations, Plenum Press, 85–103.
- Kuhn, A., Ducasse, S. & Gîrba, T. 2007. "Semantic clustering: Identifying topics in source code".
  Information and Software Technology 49(3):230–243.
- Lakos, J. 1996. "Large-Scale C++ Software Design". Addison-Wesley.
- Laval, J., Anquetil, N., Bhatti, U. & Ducasse, S. 2013. "oZone: Layer identification in the presence of
  cyclic dependencies". Science of Computer Programming 78(8):1055–1072.
- Lutellier, T., Chollak, D., Garcia, J., Tan, L., Rayside, D., Medvidovic, N. & Kroeger, R. 2015.
  "Comparing Software Architecture Recovery Techniques Using Accurate Dependencies". 37th International
  Conference on Software Engineering (ICSE), vol. 2, 69–78.
- Lutellier, T., Chollak, D., Garcia, J., Tan, L., Rayside, D., Medvidovic, N. & Kroeger, R. 2018.
  "Measuring the Impact of Code Dependencies on Software Architecture Recovery Techniques". IEEE
  Transactions on Software Engineering 44(2):159–181.
- Mancoridis, S., Mitchell, B. S., Rorres, C., Chen, Y. & Gansner, E. R. 1998. "Using Automatic Clustering to
  Produce High-Level System Organizations of Source Code". 6th International Workshop on Program
  Comprehension (IWPC), 45–52.
- Mancoridis, S., Mitchell, B. S., Chen, Y. & Gansner, E. R. 1999. "Bunch: A Clustering Tool for the Recovery
  and Maintenance of Software System Structures". IEEE International Conference on Software Maintenance
  (ICSM), 50–59.
- Martin, R. C. 2017. "Clean Architecture: A Craftsman's Guide to Software Structure and Design". Prentice
  Hall.
- Mitchell, B. S. & Mancoridis, S. 2006. "On the Automatic Modularization of Software Systems Using the Bunch
  Tool". IEEE Transactions on Software Engineering 32(3).
- Newman, M. E. J. & Girvan, M. 2004. "Finding and evaluating community structure in networks". Physical
  Review E 69(2):026113.
- Pearl, J. 1988. "Probabilistic Reasoning in Intelligent Systems: Networks of Plausible Inference". Morgan
  Kaufmann.
- Raghavan, U. N., Albert, R. & Kumara, S. 2007. "Near linear time algorithm to detect community structures
  in large-scale networks". Physical Review E 76(3):036106.
- Reichardt, J. & Bornholdt, S. 2006. "Statistical mechanics of community detection". Physical Review E
  74(1):016110.
- Sarkar, S., Maskeri, G. & Ramachandran, S. 2009. "Discovery of architectural layers and measurement of
  layering violations in source code". Journal of Systems and Software 82(11):1891–1905.
- Traag, V. A., Waltman, L. & van Eck, N. J. 2019. "From Louvain to Leiden: guaranteeing well-connected
  communities". Scientific Reports 9:5233.
- Tzerpos, V. & Holt, R. C. 2000a. "ACDC: An Algorithm for Comprehension-Driven Clustering". 7th Working
  Conference on Reverse Engineering (WCRE), 258ff.
- Tzerpos, V. & Holt, R. C. 2000b. "On the stability of software clustering algorithms". 8th International
  Workshop on Program Comprehension (IWPC), 211–218.
- Wu, J., Hassan, A. E. & Holt, R. C. 2005. "Comparison of clustering algorithms in the context of software
  evolution". IEEE International Conference on Software Maintenance (ICSM), 525–535.
