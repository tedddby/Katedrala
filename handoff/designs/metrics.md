# Katedrala metrics design (milestone 6)

## 0. Scope, conventions and status labels

This document specifies how `@katedrala/metrics` fills `MetricsReport` (`packages/ir/src/types/metrics.ts`), how
`katedrala health` fills `HealthReport.indicators`, and how `katedrala impact` fills `ImpactReport.risk`. It is
written against the existing APIs of `@katedrala/graph` (`stronglyConnectedComponents`, `condensation`,
`reachabilityCounts`, `longestPathLengths`, `betweennessCentrality`, `pageRank`, `modularity`,
`greedyFeedbackArcSet`, `Digraph.toUndirected`) and `@katedrala/model` (`ArchitectureModel.projection`,
`Projection`, `aggregateDependencies`, `fromProjectionInfo`). It is the source for docs/ALGORITHMS.md (sections
1–5, 8) and for the threshold tables of the health and impact documentation (sections 6–7). Fixture numbers
were computed with scratch prototypes (`lib.mjs`, `final.mjs`, `gcases.mjs`, `gsens.mjs`, `corr.mjs`, `roles2.mjs`
in the session scratchpad `m6/` folder, not part of the repository) on the fixtures' `expected.json` import lists,
with directories standing in for modules.

Every quantity carries one of three labels:

- **[ESTABLISHED]** — a published measure, cited (author, year, title, venue) and computed as published.
- **[ESTABLISHED, ADAPTED]** — a published concept with a Katedrala operationalization choice; the deviation is
  stated explicitly.
- **[KATEDRALA HEURISTIC]** — a Katedrala design. Rationale, constants and limitations are given; it is never
  presented as an established measure, and its `MetricDefinition.origin` is `katedrala-heuristic`.

Notation used throughout:

| Symbol | Meaning |
| --- | --- |
| `L` | analysis level: `symbol`, `file`, `component`, `module`, `layer`, `package` |
| `G_L = (V, E)` | the dependency graph of the level-`L` projection (`Projection.graph`): no self-loops, parallel edges merged |
| `n = \|V\|`, `m = \|E\|` | units and distinct unit→unit dependencies at level `L` |
| `Ca(v)`, `Ce(v)` | in-degree and out-degree of `v` in `G_L` |
| `Rin(v)`, `Rout(v)` | number of *other* units that reach `v` / that `v` reaches (`reachabilityCounts(G_L, "in" \| "out")`) |
| `VFI(v)`, `VFO(v)` | visibility fan-in/fan-out including self: `Rin(v) + 1`, `Rout(v) + 1` (Baldwin et al. 2014) |
| `SCC(v)` | the strongly connected component containing `v`; *cyclic group* = SCC with ≥ 2 members |
| `N_f`, `E_f` | files and distinct file→file dependencies of the file projection |
| `mod(f)` | the module listing file `f` (undefined when no module lists it) |
| `M` | number of modules that contain at least one projected file |
| `W(A→B)` | number of distinct file→file dependencies `(f, g) ∈ E_f` with `mod(f) = A`, `mod(g) = B` |
| `ln` | natural logarithm; `log2` base-2 logarithm |

Three normalization transforms are used by the heuristics. None depends on the snapshot's maximum value; each is
either an absolute saturation with a documented constant or a ratio to the size of the system:

- **Saturation** `S(x; k) = x / (x + k)` for counts `x ≥ 0` (unbounded). `S(0) = 0`, `S(k) = 0.5`, `S → 1`.
  Independent of the snapshot.
- **Anchored saturation** `A(x; x₀) = x(1 + a) / (x + a)` with `a = x₀ / (1 − 2x₀)`, for ratios `x ∈ [0, 1]`
  and an anchor `0 < x₀ < 0.5`. `A(0) = 0`, `A(x₀) = 0.5`, `A(1) = 1`, increasing and concave. Independent of
  the snapshot; `x₀` is a documented reference level.
- **Log-share** `Λ(x; X) = ln(1 + x) / ln(1 + X)` for a count `0 ≤ x ≤ X`, where `X` is the *largest possible*
  value given the size of the system (e.g. `n − 1` other units), never the observed maximum. `Λ(0) = 0`,
  `Λ(X) = 1`; defined as 0 when `X = 0`. Depends on the snapshot only through its size, and only
  logarithmically: growing a 1 000-unit system by 10 % with unrelated units lowers `Λ` by about 1.4 %
  (`ln 1000 / ln 1100`), against 9 % for the linear share `x / X`. The logarithm is chosen because in-degree
  and reach in software dependency graphs are heavy-tailed, so a linear share compresses all but the largest
  hubs to ≈ 0.

All three map into `[0, 1]`, so every `ScoreTerm.normalized` is in `[0, 1]` and, with weights summing to 1, every
score is in `[0, 1]`.

**Constants at a glance** (all fixed in the `@1` methods; changing any of them requires a new method version):

| where | constant | value |
| --- | --- | --- |
| gravity | weights reach / fan-in / spread / brokerage | 0.40 / 0.20 / 0.25 / 0.15 (coarse levels or `M < 2`: 0.50 / 0.30 / — / 0.20) |
| gravity | spread saturation `k` | 3 modules |
| entropy | weights cyclicity / direction / dispersion / propagation | 0.30 / 0.25 / 0.25 / 0.20 (`M < 2`: 0.60 / 0 / 0 / 0.40) |
| entropy | cycle-size weight `ω(s)` | `min(1, log2 s / 5)` (full weight from 32 files) |
| entropy | anchors | cyclicity 0.15; direction `f` 0.10; dispersion `P` 3; propagation 1/3 |
| entropy | rating bands | low < 0.25 ≤ moderate < 0.45 ≤ high < 0.65 ≤ severe |
| roles | size / sensitivity / dominance | `x` 5 %, `y` 1 %, `z` 50 % (Baldwin et al. 2014) |
| change risk | weights files / modules / direct / endpoints / test gap / cycle | 0.30 / 0.20 / 0.15 / 0.15 / 0.10 / 0.10 |
| change risk | saturation constants | files 20, modules 3, direct 8, endpoints 3, tests 2, cycle 4 |
| change risk | bands | low < 0.25 ≤ medium < 0.50 ≤ high < 0.75 ≤ critical |
| approximation | exact reachability / betweenness | `c ≤ 20 000` SCCs / `n (n + m) ≤ 2^28`, else ≥ 64 pivots |
| PageRank | damping / tolerance / max iterations | 0.85 / 1e-10 / 1 000 |

## 1. Projections and common definitions

**1.1 Metrics projection.** `MetricsReport.projection` (`ProjectionInfo`) is fixed per run; defaults come from
`@katedrala/model`: `edgeKinds = DEFAULT_EDGE_KINDS` (every known kind except `depends-on-package`),
`includeTypeOnly = true` (type-only imports are design-time dependencies; `includeTypeOnly = false` gives the
runtime view), `fileRoles = DEFAULT_FILE_ROLES` (`declaration`, `source`; tests are excluded), and externals are
not nodes (`includeExternals = false`: metrics describe the analyzed code, not third-party packages). For each
level `L ∈ PROJECTION_LEVELS` the stage builds `P_L = model.projection({ level: L, ...fromProjectionInfo(info) })`
once and reuses it (projections are memoized). `symbol` is computed only when `detail.symbolMetrics`; `layer`
only when layers exist.

**1.2 Units.** The units of level `L` are `P_L.nodes` (sorted entity ids; node `i` of `P_L.graph` is
`nodes[i]`). Components own their *directly* listed files (the projection maps a file to the deepest component
listing it), so all component-level metrics — including `size`, `types` and `cohesion` — use directly owned
files; this matches `UnitMetrics.size` ("for components: its directly owned files"). Units listed in the document
but absent from the projection (e.g. a component that owns only test files) get no `UnitMetrics` entry.

**1.3 Graph quantities shared by all metrics** (computed once per level, in this order):

```
scc   = stronglyConnectedComponents(G)          // componentOf, components (renumbered by smallest member)
dag   = condensation(G, scc)                    // c = scc.count nodes, acyclic
rin   = reachabilityCounts(G, "in",  REACH_OPTS) // .counts = Rin, .exact
rout  = reachabilityCounts(G, "out", REACH_OPTS) // .counts = Rout
depthC = longestPathLengths(dag, "out")          // per SCC
bet   = betweennessCentrality(G, BETWEENNESS_OPTS(n, m))   // raw (unnormalized) values, .exact
pr    = pageRank(G, { damping: 0.85, tolerance: 1e-10, maxIterations: 1000 })
```

`REACH_OPTS` and `BETWEENNESS_OPTS` are defined in section 8. Edge weights (observation sums) are ignored by
every graph metric: one distinct dependency counts once, so a file that calls a helper 200 times does not
outweigh 200 files that call it once.

**1.4 File-level partition quantities** (used by system metrics, cohesion, entropy and gravity). On the file
projection, an edge `(f, g)` is *classified* when both `mod(f)` and `mod(g)` are defined; it is *internal* when
`mod(f) = mod(g)` and *cross-module* otherwise. Unclassified edges (an endpoint in no module) are excluded from
every partition quantity, and the number excluded is reported as evidence where it matters.

## 2. Established metrics

Running example **E1** (fixture `simple-dependencies`, file level, modules = directories `src`, `src/services`,
`src/utils`): `index → app`, `app → expense-service`, `app → logger`, `expense-service → currency`,
`currency → math` (n = 6, m = 5, acyclic).

| file | Ca | Ce | Rin | Rout | depth | raw betweenness | betweenness | PageRank × n |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| index.ts | 0 | 1 | 0 | 5 | 4 | 0 | 0 | 0.4966 |
| app.ts | 1 | 2 | 1 | 4 | 3 | 4 | 0.20 | 0.9188 |
| services/expense-service.ts | 1 | 1 | 2 | 2 | 2 | 4 | 0.20 | 0.8871 |
| utils/currency.ts | 1 | 1 | 3 | 1 | 1 | 3 | 0.15 | 1.2507 |
| utils/logger.ts | 1 | 0 | 2 | 0 | 0 | 0 | 0 | 0.8871 |
| utils/math.ts | 1 | 0 | 4 | 0 | 0 | 0 | 0 | 1.5597 |

(Values produced by the `@katedrala/graph` implementations; they are the expected values of the E1 golden test.)

### 2.1 Fan-in / fan-out (afferent / efferent coupling) — [ESTABLISHED, ADAPTED]

`fanIn(v) = Ca(v) = |{u ≠ v : (u, v) ∈ E}|`, `fanOut(v) = Ce(v) = |{w ≠ v : (v, w) ∈ E}|` on `G_L`.

- *Source.* Fan-in/fan-out as structure metrics: Henry & Kafura (1981). Afferent/efferent coupling of a
  category: Martin (1994), who defines **Ca as "the number of classes outside this category that depend upon
  classes within this category"** and **Ce as "the number of classes inside this category that depend upon
  classes outside"** (verified in the 1994 text).
- *Adaptation.* The IR counts **distinct units** at the unit's own level (a module's `fanIn` is the number of
  modules depending on it), not member elements. Reasons: the value means the same thing at every level, it is
  not inflated by unit size, and it is the neighbour count used by the graph metrics. Martin's element-based count
  (distinct files outside the unit with a dependency into it) is computable from the file projection; it is not
  an IR field. ALGORITHMS.md must state this deviation.
- *Edge cases.* Isolated unit: 0 / 0. Self-dependencies do not exist in projections (internal edges are summarized
  separately).

### 2.2 Instability `I` — [ESTABLISHED]

`I(v) = Ce / (Ca + Ce)`; `null` when `Ca + Ce = 0` (Martin 1994; Stable Dependencies Principle in Martin 2003).
Computed from the adapted `Ca`/`Ce` of 2.1. E1 modules: `src` (Ca 0, Ce 2) → 1; `src/services` (1, 1) → 0.5;
`src/utils` (2, 0) → 0.

### 2.3 Abstractness `A` — [ESTABLISHED, ADAPTED]

Martin (1994): `A = abstract classes / total classes` of a category. Katedrala's IR definition, adapted to
languages with interfaces, type aliases and declaration merging:

- `types(u)` = number of symbols in the unit's files with `category = "type"` and `kind ≠ "type-alias"` (an alias
  names an existing type; it is not a design abstraction of its own). **Merged declarations count once**: the IR
  already represents declaration merging and overloads as one symbol whose `declarations` lists the parts, so
  counting symbols counts each type once; partial declarations that point to a canonical one (`partOf` set) are
  not counted again.
- `abstractTypes(u)` = those types with `SymbolEntity.abstract = true`, which the adapter sets in Martin's sense:
  interfaces and traits declaring behaviour (methods) and abstract classes; data-only interfaces are not
  abstract.
- `abstractness = abstractTypes / types`; `null` when `types = 0` (e.g. plain JavaScript without classes).
- Levels: package, module, layer, component (directly owned files), file. At the `symbol` level `types` and
  `abstractTypes` count the symbol itself and the type symbols lexically nested in it, but `abstractness` and
  `distance` are `null` (Martin's metrics describe groups of classes, not single declarations).

### 2.4 Distance from the main sequence `D` — [ESTABLISHED]

Martin (1994) defines `D = |A + I − 1| / √2` (range [0, ~0.707]) and the normalized form `Dn = |A + I − 1|`
(range [0, 1]). The IR field `distance` is **`Dn`**, and ALGORITHMS.md must say so. `null` when `A` or `I` is
`null`. The sign of `A + I − 1` separates the zone of pain (`< 0`: stable and concrete) from the zone of
uselessness (`> 0`: unstable and abstract); anomaly detection uses it. Example: a module with 4 types of which 3
are interfaces (`A = 0.75`) and `I = 0.2` has `D = |0.75 + 0.2 − 1| = 0.05`.

Reference choice: Martin (1994) introduced Ca, Ce, I, A and D (position paper, OOPSLA '94 metrics workshop);
Martin (2003) is the book that publishes the Stable Dependencies / Stable Abstractions principles and the main
sequence. Cite 1994 for the formulas and 2003 for the principles.

### 2.5 Transitive dependents / dependencies (visibility) — [ESTABLISHED]

`transitiveDependents(v) = Rin(v)`, `transitiveDependencies(v) = Rout(v)`: other units reachable along reversed /
forward edges, excluding `v` itself and including the other members of `v`'s cyclic group. These are the
visibility fan-in and fan-out of MacCormack, Rusnak & Baldwin (2006) and Baldwin, MacCormack & Rusnak (2014) minus
the self term: `VFI = Rin + 1`, `VFO = Rout + 1`. Exact or estimated as described in section 8
(`SystemMetrics.reachabilityExact` records which). Estimates are reported unrounded (the IR rounds every real to 9
significant digits).

### 2.6 Depth — [ESTABLISHED, ADAPTED]

`depth(v) = depthC[scc.componentOf[v]]`: the number of edges of the longest path starting at `v`'s SCC in the
condensation (`longestPathLengths(dag, "out")`). 0 for units without dependencies. Members of one cyclic group
share a depth and a cycle counts as one step: this is the levelization of Lakos (1996) (level = 1 + the longest
chain of dependencies below a component) restated on the condensation, reported as `level − 1` so that leaves are
0. `SystemMetrics.maxDepth = max_v depth(v)` on the file level (0 for an empty graph). E1: `index.ts` has depth 4.

### 2.7 Betweenness centrality — [ESTABLISHED]

Raw betweenness `B(v) = Σ_{s ≠ v ≠ t} σ_st(v) / σ_st` over ordered pairs (directed, unweighted shortest paths;
Freeman 1977), computed with Brandes' algorithm (Brandes 2001) and sampled for large graphs (Brandes & Pich
2007; section 8). The IR value is normalized for directed graphs: `betweenness(v) = B(v) / ((n − 1)(n − 2))`,
the number of ordered pairs of other units (the attainable maximum); this is the directed analogue of Freeman's
undirected normalization `2B / ((n − 1)(n − 2))`. `n ≤ 2` → 0. E1: `app.ts` lies on the shortest paths
`index→expense-service`, `index→logger`, `index→currency` and `index→math`, so `B = 4` and the normalized value is
`4 / 20 = 0.2`. Gravity uses the raw value (section 4).

### 2.8 Relative PageRank (ComponentRank) — [ESTABLISHED, ADAPTED]

`pageRank(v) = n · PR(v)`, where `PR` is PageRank (Page et al. 1999) on `G_L` with rank flowing from a unit to
what it uses, as in ComponentRank (Inoue et al. 2005): damping 0.85, uniform teleportation, dangling units spread
their rank uniformly, unweighted edges, tolerance 1e-10 (L1), at most 1 000 iterations. Multiplying by `n` makes
the mean 1 at every system size ("relative"), so values are comparable across snapshots: > 1 means more than an
average share of the use flow ends at the unit. Adaptation: Inoue et al. also merge similar components and weight
use relations; Katedrala does neither. E1: `math.ts` 1.56 (end of the longest chain), `index.ts` 0.50 (entry
point; it receives only teleportation and dangling mass). Non-convergence → `approximation-used` diagnostic.

### 2.9 System size, density and average fan-out — [ESTABLISHED]

On the file level: `files = N_f`, `dependencies = |E_f|`, `density = |E_f| / (N_f (N_f − 1))` (0 when
`N_f < 2`), `averageFanOut = |E_f| / N_f` (0 when `N_f = 0`). E1: density `5/30 = 0.1667`, average fan-out
`0.833`.

### 2.10 Propagation cost — [ESTABLISHED]

`PC = Σ_v VFO(v) / n² = (Σ_v Rout(v) + n) / n²` on the file level (MacCormack, Rusnak & Baldwin 2006): the density
of the visibility matrix including the diagonal, i.e. the average share of files a change to one file can reach,
itself included (the paper's six-element example gives 42 %). Implemented by `propagationCost(G)`. Properties:
`PC ∈ [1/n, 1]`, 0 for the empty graph, `1/n` for an edgeless graph, and `PC = ACD / n` (2.11).

Reference values (file-level matrices): Mozilla 17.35 % before and 2.78 % after its 1998 redesign, Linux 2.1.88
5.65 % (MacCormack et al., working-paper tables); across 129 projects the median PC is 18 % and the 80th
percentile 34 % (Mo et al. 2016, Table 1). PC falls with system size for a fixed structure (the self term alone is
`1/n`), so long-term trends should be read together with `files`. E1: `Σ Rout = 12`, `PC = (12 + 6) / 36 = 0.5`.

### 2.11 Cumulative / average / normalized component dependency — [ESTABLISHED]

Lakos (1996), on the file level (Lakos' components are C++ header/implementation pairs; files are their
counterpart here):

- `CCD = Σ_v (Rout(v) + 1)`: the number of files needed to test every file incrementally, each counting itself;
- `ACD = CCD / n` (0 when n = 0);
- `NCCD = CCD / CCD_bbt(n)`, where `CCD_bbt(n)` is the CCD of a **balanced binary tree with the same number of
  nodes**, each node depending on its two children (0 when n = 0).

**Exact `CCD_bbt(n)`.** In a tree whose nodes depend on their descendants, a node's count (itself included) is
the size of its subtree, so CCD = Σ subtree sizes = Σ over nodes of (depth + 1). For the complete binary tree on
`n` nodes in heap order (node `i ∈ 1..n` has depth `⌊log2 i⌋`), `depth(i) + 1` is the bit length of `i`:

```
CCD_bbt(n) = Σ_{i=1..n} bitLength(i) = (n + 1)·k − 2^k + 1,   k = bitLength(n) = ⌊log2 n⌋ + 1   (n ≥ 1)
CCD_bbt(0) = 0
```

For a perfect tree, `n = 2^k − 1`, this equals Lakos' closed form `(n + 1)·log2(n + 1) − n`. For other `n`, the
heap-shaped tree is the canonical balanced tree (a documented Katedrala choice; the continuous formula differs by
< 2 %, e.g. 92.1 instead of 94 at n = 24). Compute `k` with integer arithmetic (`32 − Math.clz32(n)`), never with
`Math.log2`. Values: n = 1 → 1, 2 → 3, 3 → 5, 4 → 8, 6 → 14, 7 → 17, 8 → 21, 15 → 49, 24 → 94, 100 → 580,
1 000 → 8 987. Reading: NCCD ≈ 1 is tree-like, < 1 flatter than a tree, > 1 deeper or cyclic (CCD grows
quadratically with the size of a cycle). E1: `CCD = 18`, `ACD = 3`, `NCCD = 18 / 14 = 1.286`.

### 2.12 Cycle summaries — [ESTABLISHED]

Per level, from `scc`: `groups` = SCCs with ≥ 2 members (`isNontrivialComponent`; projections have no
self-loops), `unitsInCycles` = their total size, `largestGroup`, `ratio = unitsInCycles / n` (0 when n = 0).
`UnitMetrics.cycleGroup` is the id of the `dependency-cycle` anomaly of the unit's group. Metrics run before
anomalies, so the id must come from a shared pure function `cycleAnomalyId(level, sortedMemberIds)` in
`@katedrala/model` (or `ir`) that both stages call.

### 2.13 Modularity of the module partition — [ESTABLISHED]

`Q` of Newman & Girvan (2004) at resolution 1 (`modularity(U, communities)`), where `U` is the undirected,
**unweighted** file graph induced by the files that belong to a module (each distinct dependency has weight 1; a
mutual dependency `f ⇄ g` becomes one edge of weight 2 through `toUndirected`), and `communities[f] = mod(f)`.
`null` when there are no modules or `U` has no edges. Unweighted so that Q agrees with the other counts (distinct
dependencies). E1: `Q = 0.04` (`src`: 1/5 − (4/10)² = 0.04; `services`: 0 − (2/10)² = −0.04; `utils`: 0.04).
Caveat: in a layered design whose modules are layers, most dependencies cross modules by construction, so a low
Q is not a defect there; this is why Q is reported but is not an entropy factor (section 5.2).

### 2.14 Cross-module dependency ratio — descriptive ratio (no specific source)

`crossModuleDependencyRatio = Σ_{A≠B} W(A→B) / Σ_{A,B} W(A→B)` over classified file dependencies (1.4); 0 when
there are none. A plain descriptive share, cited to no particular paper; it is not Bunch's MQ, whose
inter-connectivity terms are per-pair densities `ε_ij / (2 N_i N_j)` (Mancoridis et al. 1998). E1: 3 of 5
dependencies cross modules → 0.6.

### 2.15 Cohesion of a unit — [KATEDRALA HEURISTIC, related to an established measure]

For packages, modules, layers and components (directly owned files):
`cohesion(u) = internal(u) / (internal(u) + outgoing(u))`, where `internal(u)` counts the distinct file
dependencies `(f, g)` with both files in `u`, and `outgoing(u)` those with `f ∈ u` and `g ∉ u` (`g` projected).
`null` when the member files have no dependencies; absent for files and symbols.

Coupling and cohesion as design criteria go back to Stevens, Myers & Constantine (1974), but this ratio is
**not** an established measure, and ALGORITHMS.md must say so. Its closest relative is the *cluster
factor* of Bunch's TurboMQ (Mitchell & Mancoridis 2006), `CF_i = μ_i / (μ_i + ½ Σ_{j≠i} (ε_ij + ε_ji))`, which
also counts **incoming** inter-cluster edges. MQ's *intra-connectivity* `A_i = μ_i / N_i²` (Mancoridis et al.
1998) is a density, not a ratio. Katedrala keeps outgoing edges only, because incoming dependencies measure how
much others use the unit: counting them would make every widely used library look non-cohesive. A test property
follows: for the module partition, `Σ_u internal / Σ_u (internal + outgoing) = 1 − crossModuleDependencyRatio`.
E1: `src` 1/3, `src/services` 0, `src/utils` 1.

## 3. Structural roles (core–periphery)

### 3.1 The published procedure — [ESTABLISHED]

Baldwin, MacCormack & Rusnak (2014), "Hidden structure: Using network methods to map system architecture"
(Research Policy 43(8); HBS working paper 13-093), verified against the working-paper text (section 3.6–3.7 and
Appendix A):

1. Compute the visibility matrix *including path length 0*, so every element sees itself; `VFI`, `VFO` are its
   column and row sums (`Rin + 1`, `Rout + 1`).
2. Cyclic groups are sets of elements that see each other; all members of a cyclic group have the same VFI and
   VFO (their Proposition 1). The **largest cyclic group is the Core**, of size `nC`; `n2` is the size of the next
   largest (0 if none).
3. Architecture type, with size threshold `x = 5 %`, sensitivity `y = 1 %`, dominance `z = 50 %`
   (parameters "motivated by the characteristics of our dataset"; N = number of elements):
   - (a) `nC ≥ (x − y)·N`? If not → **hierarchical**.
   - (b) `nC ≥ (1 + z)·n2`? If not → **multi-core**.
   - (c) `nC ≥ (x + y)·N`? If yes → **core-periphery**, else **borderline core-periphery**.
4. **Core–periphery partition** (core-periphery and borderline systems): Core = the largest cyclic group, with
   common values `VFI_C`, `VFO_C`; the other elements are **Shared** (`VFI ≥ VFI_C`, `VFO < VFO_C`), **Peripheral**
   (`VFI < VFI_C`, `VFO < VFO_C`) and **Control** (`VFI < VFI_C`, `VFO ≥ VFO_C`). (The `≥` glyph is lost in the
   text extraction of the paper; it follows from the stated `<` conditions being complementary.)
5. **Median partition** (hierarchical and multi-core systems, where the core view is unstable or unbalanced): with
   medians `VFI_M`, `VFO_M`: **Central** (`VFI ≥ VFI_M`, `VFO ≥ VFO_M`), **Shared** (`≥`, `<`), **Peripheral**
   (`<`, `<`), **Control** (`<`, `≥`). Their footnote 7: it may be necessary to exclude singletons
   (`VFI = VFO = 1`) to obtain balanced groups.

In their sample (1 286 releases of 17 applications) the Core ranged from 1 % to 75 % of the files (mean 16 %,
median 9 %), and most releases were core-periphery.

### 3.2 How Katedrala applies it — [ESTABLISHED, ADAPTED]

The procedure runs independently at every level on `G_L` (elements = units, `N = n`), using `VFI = Rin + 1` and
`VFO = Rout + 1` from section 1.3. IR mapping: Core and Central → `core`; Shared → `shared`; Control →
`control`; Peripheral → `periphery`; plus `isolated`. Katedrala adds five documented rules, each labeled
**[KATEDRALA HEURISTIC]**:

- **K1 Isolated units.** A unit with `Ca = Ce = 0` (`VFI = VFO = 1`) is `isolated` in both views and is excluded
  from the medians (footnote 7 made mandatory). `N` in step 3 still counts it (as in the paper, N is the system).
- **K2 Dominated core.** The core partition leaves undefined a non-core unit with `VFI ≥ VFI_C` *and*
  `VFO ≥ VFO_C` (possible when a long acyclic chain outside a small core sees more than the core). If any such unit
  exists, the largest cyclic group is not the structural centre and the level uses the median view; evidence
  records the reason. (A unit that reaches the core always has `VFI < VFI_C`, and a unit reached from the core
  always has `VFO < VFO_C`, so only units unrelated to the core can trigger K2.)
- **K3 Median ties.** VFI/VFO distributions are heavy-tailed with many ties at small values, so `≥ median` can
  put nearly every unit into the "high" group (e.g. median `VFO = 2` makes every unit with one dependency "high").
  For each dimension Katedrala chooses between `value ≥ median` (the paper's rule) and `value > median`,
  whichever puts the number of live (non-isolated) units in the high group closer to half of them; on a tie of
  that comparison it keeps `≥`. Medians of an even count are the mean of the two middle values.
- **K4 No-dependent / no-dependency floor.** A unit with `VFI = 1` (nothing depends on it) is never high-VFI, and
  one with `VFO = 1` is never high-VFO, whatever the median.
- **K5 Estimated visibility.** On very large levels (section 8) VFI/VFO are estimates; members of one SCC still
  share their estimate (the estimator works per condensation node), so the procedure is unchanged, and
  `reachabilityExact = false` flags it.

Pseudo-code (per level; deterministic, no randomness beyond section 8's seeded estimates):

```
classifyRoles(G, Rin, Rout, scc):
  n ← |V|; VFI[v] ← Rin[v] + 1; VFO[v] ← Rout[v] + 1
  groups ← nontrivial SCCs sorted by (size desc, smallest member id asc)
  nC ← size(groups[0]) or 0; n2 ← size(groups[1]) or 0
  if nC < (x − y)·n or nC < 2:   arch ← "hierarchical"
  elif nC < (1 + z)·n2:          arch ← "multi-core"
  elif nC < (x + y)·n:           arch ← "borderline-core-periphery"
  else:                          arch ← "core-periphery"
  view ← arch ∈ {core-periphery, borderline} ? "core" : "median"
  if view = "core":
    C ← groups[0]; (I_C, O_C) ← (VFI, VFO) of any member of C
    if ∃ v ∉ C, not isolated: VFI[v] ≥ I_C and VFO[v] ≥ O_C:  view ← "median"   (K2)
  for v in V (ascending):
    if VFI[v] = 1 and VFO[v] = 1: role ← isolated                               (K1)
    elif view = "core":
      role ← v ∈ C ? core : (VFI[v] ≥ I_C ? shared : (VFO[v] ≥ O_C ? control : periphery))
    else:
      live ← non-isolated units; I_M, O_M ← medians over live
      hiI ← balancedRule(VFI, I_M)(v) and VFI[v] > 1                          (K3, K4)
      hiO ← balancedRule(VFO, O_M)(v) and VFO[v] > 1
      role ← hiI and hiO ? core : hiI ? shared : hiO ? control : periphery
```

### 3.3 Graphs without a large cycle, small levels and modules

- *No cyclic group* (`nC = 0`): hierarchical, median view. This is the normal case for well-layered code and for
  coarse levels.
- *Small levels* (a handful of modules, layers or packages): the percentage tests are almost always passed by any
  2-cycle (`0.06 · 5 < 2`), so a 2-module cycle becomes "the core". This is faithful to the procedure; the
  architecture type and view are reported (proposed IR addition, section 11) so readers can discount tiny levels.
- *Level without modules / layers*: no units, no roles.
- *Single unit*: isolated.

### 3.4 Worked examples

- `circular-dependencies` (file level, n = 12): cyclic groups of sizes 3, 2, 2 → (a) 3 ≥ 0.48, (b) 3 ≥ 1.5 · 2,
  (c) 3 ≥ 0.72 → core-periphery. Core = `workflow/{board,card,column}` with `VFI_C = 7`, `VFO_C = 4`;
  `shared/id.ts` (VFI 10, VFO 1) → shared; `index.ts` (1, 12), `api/serializer.ts`, `demo/seed.ts`,
  `notifications/digest.ts` (2, 7) → control; the two DTOs (4, 2) and the two `people` files (5, 3) →
  periphery.
- `high-fan-out` (file level, n = 23, acyclic): hierarchical, median view; `VFI_M = 3`, `VFO_M = 2`. With the
  paper's `≥` rule 14 of 23 files would be "central" (every file with a single dependency is high-VFO); K3 selects
  `> 2` for VFO, giving 10 shared, 10 control, 3 periphery and no core — the orchestrator (VFI 2, VFO 22) and
  `main.ts` (1, 23) are control, `adapters/http-client.ts` (16, 1) is shared.
- Module level, `A → B → C → A`, `D → A`, `E` isolated (n = 5): `nC = 3 ≥ 0.2`, `n2 = 0`, `3 ≥ 0.3` →
  core-periphery; core `{A, B, C}` with `VFI_C = 4`, `VFO_C = 3`; D (1, 4) → control; E → isolated.

Limitations: the thresholds `x, y, z` were chosen for the authors' sample of 17 applications (they note that other
environments may need other values); medians make roles relative to the snapshot (a unit can change role when
unrelated code changes — expected for a positional classification, and reported in diffs as role changes, not
gravity changes).

## 4. Architectural Gravity (`katedrala/gravity@1`) — [KATEDRALA HEURISTIC]

**Intent.** How much of the rest of the system rests on a unit: how far a change to it can travel, how many units
use it directly, how many architectural boundaries those users sit behind, and how many dependency paths it
relays. Gravity is a measure of *importance*, not of quality (`higherIs: "neutral"`): a high-gravity unit is not
a defect, it is a unit whose changes deserve care. It is computed for every unit at every level on that level's
projection.

### 4.1 Signals considered

| Signal | Kept? | Reason |
| --- | --- | --- |
| Reach `Rin` (transitive dependents) | **yes, main term** | Blast radius of a change; the visibility fan-in of MacCormack et al. (2006). |
| Fan-in `Ca` (direct dependents) | **yes, secondary** | Direct dependents must adapt to an interface change, transitive ones only may; separates a hub (20 direct users) from a deep base used through one intermediary. Partly redundant with reach (Spearman ρ between `Ca` and `Rin`: median 0.78, range 0.64–0.98 over 14 fixtures), hence the lower weight. |
| Cross-module spread | **yes** (file, symbol, component levels) | Dependents behind module boundaries mean coordination across owners; the only architecture-aware signal. |
| Betweenness `B` | **yes, small weight** | Relays dependency paths (facades, adapters, service layers): nearly independent of reach (ρ median −0.10, range −0.50–0.42), so it adds information. Network measures of this family predict defects in dependency graphs (Zimmermann & Nagappan 2008). |
| Relative PageRank | **no** | Strongly redundant with reach (ρ median 0.84, range 0.58–0.93); unbounded (`n · PR ∈ [0, n]`) with no natural saturation constant. Reported on its own (2.8). |
| Fan-out, `Rout` | **no** | Measures exposure to *others'* changes, not importance to others; used by change risk and structural roles instead. |
| Size (lines, symbols) | **no** | Size is not structural importance; god components are an anomaly of their own. |

(Correlations computed on the file graphs of the 14 code fixtures with modules = directories; scratch prototype
`corr.mjs`.)

### 4.2 Terms

For unit `v` at level `L` (`n` units):

| signal | raw | normalized | weight (file, symbol, component) | weight (module, layer, package; or `M < 2`) |
| --- | --- | --- | --- | --- |
| `reach` | `Rin(v)` | `Λ(Rin; n − 1)` | 0.40 | 0.50 |
| `fan-in` | `Ca(v)` | `Λ(Ca; n − 1)` | 0.20 | 0.30 |
| `spread` | `s(v)` | `S(s; 3)` | 0.25 | — (omitted) |
| `brokerage` | `B(v)` (raw betweenness) | `Λ(B; (n − 1)(n − 2))` | 0.15 | 0.20 |

- **Spread** `s(v)` = number of distinct modules, other than the modules of `v`'s own files, that contain a file
  holding a direct dependency on `v`: for every projection edge `w → v`, every underlying IR edge (the ids in
  `Projection.edgeInfo(w, v).edges`, resolved through the document index) contributes `mod(fileOf(edge.source))`. Files in no module contribute
  nothing. A component spanning several modules owns all of them.
- At **module, layer and package** levels spread is not a separate signal (a module's dependent modules *are* its
  fan-in; for layers and packages "other modules" is not a meaningful boundary), so the term is omitted and the
  weights are those of the last column. The same 3-term formula is used at file, symbol and component levels
  when the system has fewer than two modules (`M < 2`), where spread cannot be measured. `terms[]` always lists
  exactly the terms used, so the formula applied is visible in every score.
- **Normalizations.** Reach, fan-in and brokerage use the log-share `Λ` against the largest possible value for the
  level's size (`n − 1` other units; `(n − 1)(n − 2)` ordered pairs of other units), never the observed maximum,
  so a unit's normalized value changes only when its own neighbourhood or (logarithmically) the system size
  changes. Spread uses an absolute saturation: the number of other modules touched is a coordination count whose
  meaning does not depend on how many modules exist; `k = 3` gives 0.25 for one other module, 0.5 for three,
  0.8 for twelve.
- **Score.** `gravity = Σ contribution`, `contribution = weight × normalized` (section 8.3 for rounding);
  `gravity ∈ [0, 1]`; 0 exactly when the unit has no dependents (then `Rin = Ca = s = 0` and `B = 0`, because a unit
  without predecessors lies on no path between two other units).

Weight rationale: reach dominates because gravity is about what rests on the unit; spread is the architectural
amplifier (0.25); fan-in refines reach (0.20, partly redundant); brokerage is independent but approximate on large
graphs and only indirectly about importance (0.15). The coarse-level weights keep the same proportions among the
remaining terms (0.40 : 0.20 : 0.15 ≈ 0.53 : 0.27 : 0.20, rounded to 0.50 : 0.30 : 0.20).

Term descriptions (`ScoreTerm.description`), e.g. for a file: "21 of 23 other files depend on it directly or
transitively", "20 files import it directly", "used directly from 4 other modules", "lies on 21 shortest
dependency paths between other files".

### 4.3 Pseudo-code

```
gravity(L, G, Rin, Ca, Braw, spreadOf, M):
  n ← |V|
  coarse ← L ∈ {module, layer, package} or M < 2
  W ← coarse ? {reach: .50, fan-in: .30, brokerage: .20}
             : {reach: .40, fan-in: .20, spread: .25, brokerage: .15}
  for v in V (ascending):
    terms ← [ term("reach",     Rin[v],  Λ(Rin[v], n − 1)),
              term("fan-in",    Ca[v],   Λ(Ca[v],  n − 1)) ]
    if not coarse: terms += term("spread", s ← spreadOf(v), s / (s + 3))
    terms += term("brokerage", Braw[v], Λ(Braw[v], (n − 1)(n − 2)))
    each term: weight ← W[signal]; contribution ← round9(weight × normalized)
    score ← round9(Σ contributions in the order above)
```

`Λ(x; X) = X ≤ 0 ? 0 : Math.log1p(x) / Math.log1p(X)` (use `log1p` for accuracy at small x).

### 4.4 Worked examples and sensitivity (fixtures; modules = directories)

Base weights, then the score under alternative settings: *reach-heavy* (0.55/0.15/0.15/0.15), *equal*
(0.25 each), and spread constant `k = 2` / `k = 5`.

| unit | n | Rin | Ca | s | B | reach | fan-in | spread | brok. | **gravity** | rank | reach-heavy | equal | k=2 | k=5 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| hub `core/logger.ts` (imported by 20 files; high-fan-in) | 24 | 21 | 20 | 4 | 0 | 0.973 | 0.958 | 0.571 | 0 | **0.724** | 1/24 | 0.764 | 0.626 | 0.747 | 0.692 |
| runner-up `core/errors.ts` (7 importers) | 24 | 15 | 7 | 2 | 0 | 0.872 | 0.654 | 0.400 | 0 | **0.580** | 2/24 | 0.638 | 0.482 | 0.605 | 0.551 |
| shared lib `lib/money.ts` (tangled) | 29 | 23 | 6 | 3 | 0 | 0.944 | 0.578 | 0.500 | 0 | **0.618** | 4/29 | 0.681 | 0.505 | 0.643 | 0.587 |
| deep leaf utility `utils/math.ts` (simple-dependencies) | 6 | 4 | 1 | 0 | 0 | 0.898 | 0.387 | 0 | 0 | **0.437** | 3/6 | 0.552 | 0.321 | 0.437 | 0.437 |
| orchestrator importing 20 files (high-fan-out) | 23 | 1 | 1 | 0 | 21 | 0.221 | 0.221 | 0 | 0.504 | **0.208** | 22/23 | 0.230 | 0.236 | 0.208 | 0.208 |
| entry point `main.ts` (high-fan-out) | 23 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** | 23/23 | 0 | 0 | 0 | 0 |
| isolated file (javascript-commonjs `plugins/audit-log.js`) | 13 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0** | — | 0 | 0 | 0 | 0 |

Hub, step by step: `reach = ln 22 / ln 24 = 3.0910 / 3.1781 = 0.9726`; `fan-in = ln 21 / ln 24 = 0.9580`;
`spread = 4 / 7 = 0.5714`; `brokerage = 0` (it depends on nothing, so it relays nothing);
`gravity = 0.40·0.9726 + 0.20·0.9580 + 0.25·0.5714 + 0.15·0 = 0.3890 + 0.1916 + 0.1429 = 0.7235`.

The orchestrator relays 21 shortest paths (from `main.ts` to the files below it), so brokerage is its largest
normalized term, but it matters to one file only: gravity 0.21, ranked below each of the 20 files it imports
(two files depend on each of them). Its structural role (`control`) and its fan-out describe it better; gravity
correctly does not.

**Module in a 3-module cycle** (module level, coarse weights): `A → B → C → A`, `D → A`, `E` isolated (n = 5):

| module | Rin | Ca | B | reach | fan-in | brokerage | gravity |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A (also used by D) | 3 | 2 | 3 | 0.861 | 0.683 | 0.540 | **0.744** |
| B | 3 | 1 | 2 | 0.861 | 0.431 | 0.428 | **0.646** |
| C | 3 | 1 | 1 | 0.861 | 0.431 | 0.270 | **0.614** |
| D, E | 0 | 0 | 0 | 0 | 0 | 0 | **0** |

Every member of a cycle reaches the whole cycle, so members share the reach term; fan-in and brokerage separate
them.

**Rank stability.** Over all files of six fixtures, Kendall's τ between base gravity and each variant:
reach-heavy 0.90–1.00, equal weights 0.76–0.92, brokerage removed (weights rescaled) 0.86–1.00, `k = 2`
0.98–1.00, `k = 5` 0.94–1.00. The constant `k` barely matters; the weights reorder units of similar gravity but
never move the hubs out of the top ranks.

**Size behaviour.** A hub with 20 dependents (direct and transitive) has `reach = 0.958` in a 24-file system,
0.661 at n = 100, 0.441 at n = 1 000, 0.331 at n = 10 000 and 0.264 at n = 100 000: still clearly above the
bulk of units (most have `Rin ≤ 2`, i.e. `reach ≤ ln 3 / ln 10 000 = 0.12` at n = 10 000), while a unit that
the whole system rests on scores 1 at any size.

### 4.5 Edge cases

- `n = 0`: no units. `n = 1`: the unit is isolated, gravity 0 (all `Λ` have `X = 0`).
- `n = 2`: brokerage is 0 (`(n − 1)(n − 2) = 0`); reach and fan-in are 0 or 1.
- Cycles: members share `Rin`; brokerage and fan-in differentiate them (example above).
- Estimated reach / sampled betweenness (section 8): the raw values are estimates; terms say so in their
  description ("≈"), and the metrics stage emits one `approximation-used` diagnostic per level.
- Symbol level: same formula on the symbol projection (symbols plus file nodes for file-scope code); spread uses
  the module of each dependent symbol's file.

### 4.6 Limitations

- Static structure only: a unit used on every request but imported once scores low; runtime and co-change
  coupling are out of scope for `@1`.
- Reach counts potential, not actual, propagation (a change to a private helper does not propagate even if the
  file is widely imported) — the same assumption as propagation cost.
- Units without modules contribute no spread; module inference quality bounds the spread term.
- Weights and constants are design choices validated only for monotonicity and rank stability on fixtures, not
  calibrated against outcomes (defects, change effort). A future `@2` may calibrate them against change history.

### 4.7 `MetricDefinition`

```json
{
  "key": "gravity",
  "name": "Architectural Gravity",
  "description": "How much of the rest of the system rests on the unit: transitive dependents (reach), direct dependents (fan-in), modules of direct dependents (spread, file/symbol/component levels) and relayed dependency paths (brokerage), each normalized without reference to the snapshot's maximum. A Katedrala heuristic, not an established metric.",
  "unit": "score",
  "minimum": 0,
  "maximum": 1,
  "higherIs": "neutral",
  "levels": ["component", "file", "layer", "module", "package", "symbol"],
  "provider": "katedrala",
  "method": "katedrala/gravity@1",
  "origin": "katedrala-heuristic"
}
```

## 5. Architectural Entropy (`katedrala/entropy@1`) — [KATEDRALA HEURISTIC]

**Intent.** A single, decomposable index in [0, 1] of *structural disorder* in one snapshot: 0 = dependencies
form an acyclic, boundary-respecting, predictable structure; 1 = everything is tangled with everything. The name is
partly literal (one factor is a Shannon entropy) and partly a metaphor. It is a heuristic: its factors are
established or derived from established measures, but their selection, normalization, weights and bands are
Katedrala design choices, and it has not been validated against maintenance outcomes.

### 5.1 Background

Software that keeps evolving grows more complex unless work is done to reduce it (Lehman 1980, law of increasing
complexity), and change becomes harder over time ("code decay", Eick et al. 2001). Structural measures with
evidence of a link to maintenance cost: propagation cost (MacCormack, Rusnak & Baldwin 2006; Mozilla's redesign cut
it by > 80 %), and membership of large cyclic groups — "Core" components cost significantly more to maintain than
peripheral ones (MacCormack & Sturtevant 2016). Principles: dependencies should be acyclic (Acyclic Dependencies
Principle, Martin 2003; levelization, Lakos 1996). Shannon entropy (Shannon 1948) has been used to measure the
scattering of changes (Hassan 2009); Katedrala applies it to the scattering of dependencies across modules.
Decoupling Level (Mo et al. 2016) is an established architecture-level maintainability metric.

### 5.2 Factor selection

| Candidate | Decision | Reason |
| --- | --- | --- |
| Cyclicity (units in cycles, weighted by cycle size) | **F1, weight 0.30** | The canonical disorder (ADP); cycles prevent independent understanding, testing and release; large cores are costly (MacCormack & Sturtevant 2016). |
| Module-level direction (feedback dependencies) | **F2, weight 0.25** | Boundary-level tangles: module cycles often exist without any file cycle (A/x → B/y and B/z → A/w). Measures how far module dependencies are from flowing one way. |
| Dependency dispersion (Shannon entropy of target module given source module) | **F3, weight 0.25** | Captures both low cohesion and scatter in one quantity without penalizing a module that depends on exactly one other module (a clean layer). |
| Propagation cost | **F4, weight 0.20** | Established and literature-anchored; captures over-coupling that the other factors miss (deep, dense acyclic coupling). Lowest weight: it also grows with orderly depth, partly overlaps F1, and is volatile between versions (on OpenJPA its coefficient of variation over 9 snapshots was 26 %, against 2 % for Decoupling Level; Mo et al. 2016). |
| `1 − Q` or cross-module ratio | rejected | Penalize layered designs (where modules are layers, dependencies cross modules by construction): on all 15 code fixtures, clean and layered ones included, the cross-module ratio is 0.48–0.86 with directory modules. Neither distinguishes one-way from scattered coupling. Reported as system metrics. |
| Stable Dependencies Principle violations | rejected as a factor | `I` is computed from distinct-unit counts and is coarse at module level; violations are frequent and often benign. Kept as `unstable-dependency` anomalies. |
| Fan-out / fan-in concentration (Gini) | rejected | Concentration is not disorder (a small shared kernel used by everything is orderly). God components and hubs are anomalies. |
| Low cohesion | merged into F3 | `H(T \| S)` is low when dependencies stay inside their module. |
| Decoupling Level | deferred | Needs design-rule-hierarchy clustering of the DSM; a candidate for `@2` or a metric plugin. |
| Change entropy (Hassan 2009) | out of scope | A process measure over history, not a structural one. |

### 5.3 Factor definitions

All factors use the file projection (`N_f` files) and, for F2/F3, the module partition with classified file
dependencies (1.4). Notation: `W_tot = Σ_{A,B} W(A→B)`, `W_cross = Σ_{A≠B} W(A→B)`.

**F1 `cyclicity`.**
- raw `c = Σ_{g cyclic group} |g| · ω(|g|) / N_f`, with `ω(s) = min(1, log2(s) / 5)` (0.2 for a 2-cycle, 0.4 for
  4 files, 0.6 for 8, 0.8 for 16, 1 from 32 files up). Range [0, 1]; 0 when `N_f = 0`.
- normalized `A(c; 0.15)`: a system whose cyclic groups hold 15 % of the files (≈ the mean Core share of 16 % in
  Baldwin et al. 2014; such cores are usually large enough for ω = 1) scores 0.5.
- rationale for ω: a 2-file cycle is local and often intentional; a 30-file tangle is beyond local refactoring.
  The log scale gives each doubling of a tangle the same increment; 32 is a Katedrala constant.
- evidence: `files-in-cycles` (count and ratio), `cyclic-groups`, `largest-cyclic-group` (entities: its files).
- contributions: each file in a cyclic group `g`, share `ω(|g|) / Σ_g |g|·ω(|g|)`.

**F2 `direction`.**
- On the module graph `G_M` (edge `A → B` with weight `W(A→B)`, `A ≠ B`), `FAS_w` = the minimum total weight of
  module dependencies whose removal makes `G_M` acyclic. raw `f = FAS_w / W_cross` (0 when `W_cross = 0`). Within
  each strongly connected component, an ordering or its reverse leaves at most half of the weight backwards, so
  `f ∈ [0, 0.5]`.
- computation: per SCC of `G_M`, exact by dynamic programming over subsets when it has ≤ 16 modules
  (`best[S ∪ {j}] = min(best[S] + Σ_{i ∈ S} W(j→i))`, `O(2^k k²)`, ties resolved by ascending module index so the
  feedback set is deterministic); above 16 modules, the Eades, Lin & Smyth (1993) greedy ordering with weighted
  degrees (`δ(v) = w_out(v) − w_in(v)`), an upper bound, flagged by an `approximation-used` diagnostic. (The
  existing `greedyFeedbackArcSet` is unweighted; the metrics package adds the weighted variant or the graph
  package gains a `weighted` option.)
- normalized `A(2f; 0.2) = 8f / (6f + 1)`: 10 % of cross-module dependency weight against the best ordering scores
  0.5; 2 % → 0.14; 5 % → 0.31; 25 % → 0.80; 50 % → 1.
- evidence: `module-feedback-weight`, `cross-module-dependencies`, `modules-in-cycles`, the feedback module pairs
  (entities: their source modules).
- contributions: each module, share = weight of feedback dependencies leaving it / `FAS_w`.

**F3 `dispersion`.**
- Over classified file dependencies, let `S` be the source file's module and `T` the target file's module:
  `H(T | S) = Σ_A p_A · H_A`, `p_A = W(A→·) / W_tot`, `H_A = −Σ_B (W(A→B) / W(A→·)) · log2(W(A→B) / W(A→·))`
  (the own module counts as a target). raw = the **perplexity** `P = 2^{H(T|S)}`, the effective number of modules a
  typical dependency lands in; `P ∈ [1, M]`.
- normalized `(P − 1) / (P + 1) = S(P − 1; 2)`: `P = 1` (every module's dependencies go to one module) → 0;
  `P = 2` → 0.33; `P = 3` → 0.5; `P = 5` → 0.67. Absolute (not divided by `log2 M`), so the number of modules does
  not by itself move it; code added elsewhere changes it only through the dependency-weighted average over `A`.
- evidence: `conditional-entropy` (bits), `perplexity`, `cross-module-dependency-ratio`, `unclassified-dependencies`.
- contributions: each source module, share `p_A · H_A / H(T | S)` — an exact decomposition.

**F4 `propagation`.**
- raw `p = Σ_v Rout(v) / (N_f (N_f − 1))`: propagation cost without the diagonal (0 when `N_f < 2`), so that small
  systems are not inflated by the self term `1/N_f` (`p = (N_f · PC − 1) / (N_f − 1)`).
- normalized `A(p; 1/3) = 2p / (1 + p)`: the 80th percentile of propagation cost over 129 projects is 34 % (Mo et
  al. 2016), so a system at that level scores ≈ 0.5; median (18 %) → 0.31; 8 % → 0.15.
- evidence: `propagation-cost` (with diagonal, as in the literature), `propagation-cost-offdiagonal`, `files`.
- contributions: each file, share `Rin(v) / Σ_u Rin(u)` (the files whose changes travel furthest).

### 5.4 Score, weights and rating

`entropy = 0.30·F1 + 0.25·F2 + 0.25·F3 + 0.20·F4` (normalized values), in [0, 1].

When the system has fewer than two modules or no classified file dependencies, F2 and F3 are **not measurable**:
they are still listed (raw 0 for `f`, raw 1 for `P`, normalized 0, weight 0, evidence "not measurable: fewer than
two modules"), and F1 and F4 take weights 0.60 and 0.40 (the 0.30 : 0.20 proportion). As for gravity, the weights
in `factors[]` always show the formula used.

Weight rationale: cycles are the least ambiguous sign of disorder (0.30); boundary direction and boundary scatter
are the architecture-level counterparts (0.25 each); propagation is established but confounded with orderly depth
and volatile (0.20).

Rating bands (`EntropyReport.rating`), Katedrala defaults:

| rating | score | reading |
| --- | --- | --- |
| `low` | < 0.25 | acyclic or nearly so, coupling mostly within modules and one-way |
| `moderate` | [0.25, 0.45) | typical of maintained systems: some cycles, some scatter |
| `high` | [0.45, 0.65) | factors around their anchors, i.e. around the upper range of published distributions |
| `severe` | ≥ 0.65 | large tangles and widespread backward / scattered coupling |

Calibration argument: the anchors were chosen at "high" reference levels (F1: mean Core share; F4: 80th
percentile of propagation cost; F2, F3: Katedrala defaults), so a system sitting on all anchors scores 0.5
(`high`). A system at published *median* values (Core 9 % → F1 0.36; PC 18 % → F4 0.31) with moderate scatter
(`P = 2.5` → 0.43) and 5 % feedback (0.31) scores ≈ 0.35 (`moderate`). A ball of mud (40 % of files in a large
cycle, `p = 0.45`, `P = 6`, `f = 0.3`) scores ≈ 0.75 (`severe`).

### 5.5 Fixture results (modules = directories, scratch prototype `final.mjs`)

| fixture | n | M | F1 raw → norm | F4 raw → norm | F3 P → norm | F2 f → norm | **entropy** | rating |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tangled-architecture | 29 | 7 | 0.074 → 0.312 | 0.362 → 0.532 | 4.44 → 0.632 | 0.217 → 0.754 | **0.547** | high |
| express-app | 24 | 9 | 0 → 0 | 0.310 → 0.473 | 3.51 → 0.557 | 0.214 → 0.750 | **0.421** | moderate |
| fastify-app | 15 | 9 | 0 → 0 | 0.324 → 0.489 | 2.86 → 0.481 | 0.208 → 0.741 | **0.403** | moderate |
| circular-dependencies | 12 | 7 | 0.146 → 0.492 | 0.333 → 0.500 | 2.37 → 0.406 | 0 → 0 | **0.349** | moderate |
| ambiguous-boundaries | 28 | 5 | 0 → 0 | 0.119 → 0.213 | 2.83 → 0.478 | 0.207 → 0.738 | **0.347** | moderate |
| typescript-features | 23 | 7 | 0.017 → 0.091 | 0.198 → 0.330 | 3.46 → 0.552 | 0.083 → 0.444 | **0.342** | moderate |
| nestjs-app | 20 | 11 | 0.020 → 0.104 | 0.261 → 0.413 | 3.55 → 0.560 | 0.034 → 0.229 | **0.311** | moderate |
| dependency-violations | 18 | 7 | 0 → 0 | 0.248 → 0.398 | 3.68 → 0.573 | 0 → 0 | **0.223** | low |
| layered-architecture | 20 | 6 | 0 → 0 | 0.271 → 0.427 | 2.78 → 0.471 | 0 → 0 | **0.203** | low |
| high-fan-in | 24 | 6 | 0 → 0 | 0.230 → 0.374 | 2.93 → 0.491 | 0 → 0 | **0.197** | low |
| simple-dependencies | 6 | 3 | 0 → 0 | 0.400 → 0.571 | 1.93 → 0.318 | 0 → 0 | **0.194** | low |
| monorepo | 17 | 8 | 0 → 0 | 0.349 → 0.518 | 2.07 → 0.349 | 0 → 0 | **0.191** | low |
| clean-architecture | 25 | 9 | 0 → 0 | 0.228 → 0.372 | 2.26 → 0.387 | 0 → 0 | **0.171** | low |
| javascript-commonjs | 13 | 7 | 0 → 0 | 0.147 → 0.257 | 2.72 → 0.462 | 0 → 0 | **0.167** | low |
| high-fan-out | 23 | 3 | 0 → 0 | 0.132 → 0.234 | 1.60 → 0.231 | 0 → 0 | **0.105** | low |

The tangled fixture ranks highest and the clean, layered and monorepo fixtures low. The express and fastify
fixtures score `moderate` mainly through F2: with directory modules, the files directly under `src/` form a
module that both uses and is used by sub-directories — a real boundary tangle under that partition, which
Katedrala's module inference may resolve differently. Worked example (tangled-architecture):
`0.30·0.312 + 0.20·0.532 + 0.25·0.632 + 0.25·0.754 = 0.0936 + 0.1064 + 0.1580 + 0.1885 = 0.5465`. Its F2 feedback
set (exact DP over the 5 modules of its module cycle): `customers → cart` (3), `customers → checkout` (3),
`inventory → checkout` (2) and five single dependencies — 13 of 60 cross-module dependencies (`f = 0.217`).

### 5.6 Edge cases

- `N_f = 0`: every raw value 0 (P = 1), score 0, rating `low`, evidence "no files".
- `N_f = 1`: F4 raw 0 (`N_f < 2`), F1 0.
- Fewer than two modules: F2/F3 not measurable (5.4).
- Files outside every module: excluded from F2/F3; their count is evidence (`unclassified-dependencies`). F1 and F4
  include them.
- Estimated reachability (very large graphs): F4 uses the estimated `Σ Rout` (the sum of unbiased estimates is
  unbiased); evidence says "estimated".
- A module SCC larger than 16 modules: F2 is an upper bound (heuristic), flagged.

### 5.7 Explaining a change between snapshots (`katedrala health --baseline`)

`HealthReport.baseline.delta` is a `ScoreDelta` whose `terms` hold each factor's contribution in base and head. The
explanation is generated deterministically:

1. If the methods differ (e.g. `katedrala/entropy@1` vs `@2`), report both scores and "methods differ"; no factor
   deltas.
2. For each factor, split the contribution change into a measurement part and a formula part:
   `Δc = w_b · (N_h − N_b) + (w_h − w_b) · N_h` (the formula part is non-zero only when the factor set changed,
   e.g. modules appeared).
3. Order factors by `|Δc|` descending (ties by signal) and describe each with `|Δc| ≥ 0.005` from its raw values
   and the change of its attributed units, after mapping base entity ids through the diff's matches:
   `Δ_u = share_h(u) · raw_h − share_b(u) · raw_b` per unit, listing the largest `|Δ_u|`.
4. Template: "Entropy rose from 0.31 to 0.38 (+0.07, moderate → moderate). Cyclicity +0.05: files in cycles
   12 → 31; a new cyclic group of 19 files in module billing. Direction +0.02: feedback 3 % → 5 % of cross-module
   dependencies (billing → orders). Dispersion and propagation unchanged (< 0.005)."
5. Dilution is stated explicitly: F1 and F4 are ratios to `N_f`, so they fall when the system grows around an
   unchanged tangle; the explanation reports counts (files in cycles) next to ratios so that a decrease from
   growth is not mistaken for a fix.

`HistoryPoint.entropy.factors` stores each factor's normalized value and contribution, so the same explanation can
be produced between any two history points.

### 5.8 Limitations

- Depends on the module partition (F2, F3): an inferred partition that cuts a cohesive group in two raises F2/F3.
  Results are comparable over time only under stable module identities (the diff's module matching).
- Structure only (imports and references); no runtime coupling and no change history.
- Anchors F2 (10 %) and F3 (`P = 3`) are Katedrala defaults without published distributions; F1 and F4 anchors
  come from published samples (17 applications in Baldwin et al. 2014; 129 open-source and commercial projects
  in Mo et al. 2016) whose distributions may differ from those of TypeScript/JavaScript systems.
- Small systems: F4 is high whenever a few files form a chain; read entropy of systems below ~100 files with
  care.

### 5.9 `MetricDefinition`

```json
{
  "key": "entropy",
  "name": "Architectural Entropy",
  "description": "Decomposable index of structural disorder: cyclicity (size-weighted share of files in dependency cycles), direction (share of cross-module dependency weight in a minimum feedback set of the module graph), dispersion (perplexity of the target module of a dependency given its source module) and propagation (off-diagonal propagation cost). A Katedrala heuristic, not an established metric.",
  "unit": "score",
  "minimum": 0,
  "maximum": 1,
  "higherIs": "worse",
  "levels": ["system"],
  "provider": "katedrala",
  "method": "katedrala/entropy@1",
  "origin": "katedrala-heuristic"
}
```

## 6. Health indicators

`HealthReport.indicators` lists a fixed set of system-level indicators, in the order below. Every indicator is
"higher is worse", so `status = value ≥ concern ? "concern" : value ≥ watch ? "watch" : "ok"`, with the
thresholds reported in `thresholds`. An indicator that cannot be computed (e.g. module indicators with fewer than
two modules) is omitted rather than reported as 0. Thresholds marked *Katedrala default* are design choices, not
published values; they are configurable later but fixed in `@1`.

| id | name | value | unit | watch | concern | origin of thresholds |
| --- | --- | --- | --- | --- | --- | --- |
| `propagation-cost` | Propagation cost | `system.propagationCost` | ratio | 0.22 | 0.34 | 60th and 80th percentiles over 129 projects (Mo et al. 2016, Table 1: 20th 8 %, median 18 %, 60th 22 %, 80th 34 %). |
| `files-in-cycles` | Files in dependency cycles | `system.cycles.file.ratio` | ratio | 0.05 | 0.15 | Katedrala default, informed by Baldwin et al. 2014 (5 % size threshold for a dominant cyclic group; mean Core 16 % of a system). |
| `core-size` | Largest cyclic group | `cycles.file.largestGroup / files` | ratio | 0.06 | 0.18 | Watch: the largest-group share from which Baldwin et al. (2014) classify a system with a dominant cyclic group as core-periphery (`x + y = 6 %`). Concern: twice their median Core share (9 %) — Katedrala default. |
| `module-cycles` | Modules in dependency cycles | `system.cycles.module.unitsInCycles` | count | 2 | 5 | Watch: any module cycle breaks the Acyclic Dependencies Principle (Martin 2003). Concern: Katedrala default (a tangle of 5+ modules cannot be untangled one dependency at a time). |
| `module-feedback` | Backward module dependencies | entropy F2 raw `f` | ratio | 0.02 | 0.10 | Katedrala defaults; concern = the F2 anchor. |
| `dependency-dispersion` | Dependency dispersion | entropy F3 raw `P` | modules | 2.5 | 4 | Katedrala defaults (normalized F3 ≈ 0.43 and 0.60). |

Descriptions are sentences built from the values, e.g. "31 % of files (9 of 29) belong to dependency cycles;
the largest has 3 files." When `files < 100`, the propagation-cost description adds "small system: the value is
dominated by size", because PC ≥ 1/n.

Considered and not used as indicators (they remain in `MetricsReport`): NCCD — grows roughly like
`PC · n / log2 n`, so every large system exceeds any fixed threshold (a 10 000-file system with PC = 5 % has
NCCD ≈ 40); cross-module ratio and modularity — penalize layered designs (5.2); mean distance from the main
sequence — `A` is often 0 or undefined in TypeScript/JavaScript code, so concrete, stable utility modules would
dominate it (zone-of-pain anomalies report the meaningful cases); max depth — no defensible threshold.

Example — `tangled-architecture` (directory modules): propagation-cost 0.384 → concern; files-in-cycles 0.31 →
concern; core-size 0.103 → watch; module-cycles 5 → concern; module-feedback 0.217 → concern;
dependency-dispersion 4.44 → concern. `clean-architecture`: propagation-cost 0.259 → watch (a 25-file system,
flagged as small); every other indicator ok (no cycles, `P = 2.26`).

**Hotspots** (`HealthReport.hotspots`): the up-to-5 modules and up-to-10 files with the highest gravity among
those with `gravity ≥ 0.30`, merged and sorted by gravity descending, then level (module before file), then id.
`reasons` are the descriptions of the two terms with the largest contributions, plus "member of a cyclic group of
k units" when applicable.

## 7. Change risk (`katedrala/change-risk@1`) — [KATEDRALA HEURISTIC]

**Intent.** How risky it is to change the impact target, from the impact analysis already computed
(`ImpactReport.summary`, `impacted`, `endpoints`) plus two lookups. Absolute saturations are used throughout:
change cost is driven by how many things must be checked, not by what fraction of the system they are, so a
change touching 200 files is risky in a small and in a large repository alike. The assessment is relative to
the impact options (`ImpactOptionsInfo`: edge kinds, type-only, dispatch, depth bound), which the report states.

### 7.1 Terms

| signal | raw | normalized | weight | rationale |
| --- | --- | --- | --- | --- |
| `impacted-files` | `F = summary.files` (files containing impacted entities, direct or transitive) | `S(F; 20)` | 0.30 | Blast radius: every impacted file may need review or retesting. |
| `impacted-modules` | `m` = impacted modules other than the target's own (`summary.modules` minus the target's module when it is among them) | `S(m; 3)` | 0.20 | Changes crossing module boundaries need coordination between owners. |
| `direct-dependents` | `d = summary.directFiles` | `S(d; 8)` | 0.15 | Files that use the target directly must adapt to any interface change. |
| `endpoints` | `e = summary.endpoints` | `S(e; 3)` | 0.15 | Externally visible behaviour is affected. |
| `test-gap` | `T` = test files that depend on the target directly or transitively | `2 / (2 + T)` | 0.10 | A change no test reaches is riskier. `T` is computed on a projection that admits test files, whatever `includeTests` says, so the term is always defined; a repository without tests has `T = 0`. |
| `cycle-membership` | `c` = size of the file-level cyclic group containing the target's file, minus 1 (0 if none) | `S(c; 4)` | 0.10 | Inside a cycle, effects can come back to the changed code; reasoning about the change is harder. |

`score = Σ weight × normalized ∈ [0, 1]`. Bands (`RiskAssessment.rating`, Katedrala defaults): `low` < 0.25,
`medium` [0.25, 0.50), `high` [0.50, 0.75), `critical` ≥ 0.75.

Constants: `S(F; 20)` gives 0.5 at 20 impacted files (a typical small feature's worth of review), 0.83 at 100,
0.96 at 500; `S(m; 3)` is 0.25 for one other module and 0.5 for three; `S(d; 8)` is 0.5 at 8 direct
dependents; `S(e; 3)` is 0.25 for one endpoint and 0.5 for three; `test-gap` halves with two reaching tests;
`S(c; 4)` is 0.2 for a 2-file cycle and 0.5 for a 5-file cycle.

The target's centrality is represented by `impacted-files` and `direct-dependents` (its blast radius) instead of a
separate gravity term, which would count the same reach twice; the target's gravity and structural role appear in
`katedrala explain`. Distance is not weighted in `@1` (an impacted file at distance 5 counts like one at distance
1); `direct-dependents` carries the near part.

**Risk notes** (`riskNotes`, sorted by id), each with evidence: `incomplete-analysis` when
`summary.unresolvedInScope > 0`; `cycle-member` when `c > 0`; `cross-module-dependents` when `m ≥ 3`;
`external-integration` when the target itself depends on an external system; `untested` when `T = 0`;
`high-fan-in` when `d ≥ 20`.

### 7.2 Worked examples (fixtures; modules = directories; no fixture contains tests, so `T = 0`)

| target | F | m | d | e | T | c | terms (normalized) | **risk** | rating |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `core/logger.ts` (high-fan-in) | 21 | 5 | 20 | 6 (illustrative) | 0 | 0 | 0.512, 0.625, 0.714, 0.667, 1, 0 | **0.586** | high |
| `workflow/card.ts` (circular-dependencies) | 6 | 4 | 1 | 0 | 0 | 2 | 0.231, 0.571, 0.111, 0, 1, 0.333 | **0.334** | medium |
| `orchestrator.ts` (high-fan-out) | 1 | 0 | 1 | 0 | 0 | 0 | 0.048, 0, 0.111, 0, 1, 0 | **0.131** | low |
| domain type, hypothetical | 300 | 12 | 40 | 25 | 0 | 9 | 0.938, 0.800, 0.833, 0.893, 1, 0.692 | **0.869** | critical |

Logger: `0.30·0.5122 + 0.20·0.625 + 0.15·0.7143 + 0.15·0.6667 + 0.10·1 + 0.10·0 = 0.1537 + 0.1250 + 0.1071 +
0.1000 + 0.1000 = 0.586`. (The endpoint count is illustrative: the fixture's route files are impacted, and the
number of routes they declare depends on endpoint detection.)

### 7.3 Edge cases and limitations

- Target with no dependents: `F = m = d = e = 0`; the score is `0.10 · test-gap + 0.10 · cycle`, at most 0.20 —
  always `low`.
- Symbol targets: `F` and `d` count files containing impacted symbols, so symbol and file targets use the same
  scale.
- `maxDepth`-bounded impact: `F`, `m` and `e` count only what was explored; the score is then a lower bound and the
  report says so through `options.maxDepth`.
- Static reachability of tests is not coverage: a test may import a module and never exercise the changed
  function. `test-gap` is a proxy and is labeled as such in its description.
- The constants are defaults, not calibrated against defect data.

## 8. Complexity, approximations and determinism

### 8.1 Cost per level

`n` units, `m` dependencies, `c` SCCs, `m_c` condensation edges, `k` sample size.

| computation | time | memory | exact? |
| --- | --- | --- | --- |
| SCC (Tarjan) + condensation | `O(n + m log m)` | `O(n + m)` | yes |
| reachability counts (both directions) | exact `O((c + m_c) · c / 32)`; estimated `O(k (c + m_c))`, `k = 64` | exact ≤ `c²/8` bytes | exact iff `c ≤ 20 000` |
| depth (longest path on condensation) | `O(c + m_c)` | `O(c)` | yes |
| betweenness | exact `O(n m)`; sampled `O(k m)` | `O(n + m)` | exact iff `n (n + m) ≤ 2^28` |
| PageRank | `O((n + m) · t)`, `t ≈ 150` at tolerance 1e-10 (`0.85^t ≈ 1e-10`), `t ≤ 1 000` | `O(n)` | converged or flagged |
| modularity, cross-module ratio, cohesion, dispersion | `O(n + m)` on the file graph | `O(n + M²)` sparse | yes |
| direction (F2) | module graph `O(M + m_M)`; DP `O(2^k k²)` per module SCC of `k ≤ 16` (≤ 1.7·10⁷ steps) | `O(2^k)` | exact iff every module SCC has ≤ 16 modules |
| spread (gravity) | `O(` underlying IR edges `)` | `O(M)` per unit | yes |
| structural roles | `O(n log n)` (medians by sorting) | `O(n)` | as exact as reachability |

**Large repository (100 000 files, 1 000 000 file dependencies).** Reachability: `c` is close to `n` in mostly
acyclic code, above the exact limit, so counts are estimated with Cohen's size-estimation framework (Cohen 1997;
`k = 64`, relative standard error ≈ 12.7 % per node, roughly ±25 % at 95 %), about `7·10⁷` steps. The log-share
used by gravity damps this error: a 12.7 % error on `Rin` moves `Λ(Rin; n − 1)` by about `0.127 / ln n ≈ 0.011` at
`n = 10⁵`. Sums (propagation cost, CCD) average the per-node errors. Betweenness: `n (n + m) = 1.1·10¹¹ > 2^28`,
so `k = clamp(⌊2^28 / (n + m)⌋, 64, n) = 244` pivots (≈ 2.7·10⁸ BFS steps, a few seconds); the estimator is
unbiased (Brandes & Pich 2007), accurate for high-betweenness units and noisy for low ones, which `Λ` maps near 0
anyway. A 10 000-file system with 60 000 dependencies uses `⌊2^28 / 70 000⌋ = 3 834` pivots. PageRank: ~150
iterations over 1.1·10⁶ entries. Module-level computations are negligible (M is in the hundreds). Symbol-level
metrics (with `detail.symbolMetrics`) follow the same rules on a graph typically 5–10× larger, so they are
sampled earlier.

**Optional exact mode (proposal, graph package).** Exact counts on large condensations are feasible with
column-blocked bitsets: process target components in blocks of `B` bits (e.g. `B = 8 192`), propagating
`c × B` bitsets per block (`c · B / 8` bytes = 100 MB at `c = 10⁵`), for a total of `O((c + m_c) · c / 32)` word
operations (≈ 3.4·10⁹ at `c = 10⁵`, `m_c = 10⁶`, i.e. tens of seconds in JavaScript). Offered behind an
option, not the default.

### 8.2 Approximation policy and reporting

- `REACH_OPTS = { maxExactNodes: 20 000, sketchSize: 64, seed: 1 }` (the graph package defaults).
- `BETWEENNESS_OPTS(n, m)`: exact when `n (n + m) ≤ 2^28`, else `sample = { pivots: clamp(⌊2^28 / (n + m)⌋, 64, n), seed: 1 }`.
- PageRank: `{ damping: 0.85, tolerance: 1e-10, maxIterations: 1000 }`.
- Every approximation emits one `approximation-used` diagnostic per (level, algorithm) whose message states the
  method, parameters and expected error (e.g. "file-level betweenness estimated from 244 of 100 000 sources").
  `SystemMetrics.reachabilityExact` is true only if reachability was exact at every computed level.

**Stable sampling across snapshots (proposal, graph package).** Index-based seeded sampling is deterministic but
not *stable*: adding one file renumbers nodes, so every unit's sampled betweenness and estimated reach change,
which shows up as noise in gravity diffs and history. Fix: derive randomness from entity ids instead of node
indices. Betweenness pivots = the `k` nodes with the smallest 64-bit key `h(id) = first 8 bytes of
SHA-256("katedrala/betweenness@1\0" + id)` (bottom-k sampling: a uniform sample without replacement, so the
Brandes–Pich estimator is unchanged; a node that persists keeps its selection unless the k-th key changes).
Cohen ranks: the exponential rank of node `v` in slot `j` from `h(id_v, j)` instead of a sequential PRNG stream.
This needs two additive options in `@katedrala/graph` (`sample.sources`, per-node rank keys); no IR change.

### 8.3 Floating-point determinism

- All reductions run on one thread in ascending node index order (node order = sorted entity ids, so it does not
  depend on document order); maps are iterated in sorted key order; no parallel or `Promise.all` reductions.
- Counts, cycle sizes and `CCD_bbt` use integer arithmetic (`Math.clz32` for bit lengths).
- `Math.log`, `Math.log1p`, `Math.log2`, `Math.exp`, `Math.pow` are not required by ECMAScript to be correctly
  rounded; V8 implements them with fdlibm ports that give identical results across platforms for a given engine
  version. Katedrala pins the Node.js major version (≥ 22.12) for reproducibility, and rounding to 9 significant
  digits absorbs last-bit differences except exactly at rounding boundaries (tests compare with a 1e-9
  tolerance, golden files after rounding).
- Score assembly: `normalized := round9(x)`, `contribution := round9(weight × normalized)`,
  `score := round9(Σ contributions in term order)`. Then `|score − Σ contribution| ≤ 5·10⁻¹⁰`, inside the IR's
  1e-9 tolerance, and `contribution = weight × normalized` holds to rounding.
- Documentation inconsistency to resolve: IR.md says reals are rounded to 9 significant digits, ARCHITECTURE.md
  (ADR-007) says six decimals. This design assumes 9 significant digits (the IR contract).

## 9. MetricDefinition catalogue

`MetricsReport.definitions`, sorted by key; `provider` is `katedrala` for all. Unit-level levels
`U = ["component", "file", "layer", "module", "package", "symbol"]`; system metrics use `["system"]` and their
`SystemMetrics` field name as key. `reference` strings use the short forms of section 12.

| key | name | unit | min | max | higherIs | levels | origin | method | reference |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `abstractTypes` | Abstract types | count | 0 | — | neutral | U | established | — | Martin 1994 |
| `abstractness` | Abstractness (A) | ratio | 0 | 1 | neutral | U − symbol | established | — | Martin 1994 |
| `averageComponentDependency` | Average component dependency (ACD) | count | 0 | — | worse | system | established | — | Lakos 1996 |
| `averageFanOut` | Average fan-out | count | 0 | — | worse | system | established | — | standard graph statistic (mean out-degree) |
| `betweenness` | Betweenness centrality | ratio | 0 | 1 | neutral | U | established | `katedrala/betweenness@1` (exact or sampled, 8.2) | Freeman 1977; Brandes 2001; Brandes & Pich 2007 |
| `cohesion` | Cohesion | ratio | 0 | 1 | better | component, layer, module, package | katedrala-heuristic | `katedrala/cohesion@1` | — (related: Mitchell & Mancoridis 2006) |
| `crossModuleDependencyRatio` | Cross-module dependency ratio | ratio | 0 | 1 | neutral | system | katedrala-heuristic (descriptive ratio) | — | — |
| `cumulativeComponentDependency` | Cumulative component dependency (CCD) | count | 0 | — | worse | system | established | — | Lakos 1996 |
| `density` | Dependency density | ratio | 0 | 1 | worse | system | established | — | standard directed-graph density |
| `depth` | Dependency depth | count | 0 | — | neutral | U | established | — | Lakos 1996 (levelization, adapted) |
| `distance` | Normalized distance from the main sequence (Dn) | ratio | 0 | 1 | worse | U − symbol | established | — | Martin 1994 |
| `entropy` | Architectural Entropy | score | 0 | 1 | worse | system | katedrala-heuristic | `katedrala/entropy@1` | — |
| `fanIn` | Fan-in (afferent coupling, Ca) | count | 0 | — | neutral | U | established | — | Martin 1994; Henry & Kafura 1981 |
| `fanOut` | Fan-out (efferent coupling, Ce) | count | 0 | — | worse | U | established | — | Martin 1994; Henry & Kafura 1981 |
| `gravity` | Architectural Gravity | score | 0 | 1 | neutral | U | katedrala-heuristic | `katedrala/gravity@1` | — |
| `instability` | Instability (I) | ratio | 0 | 1 | neutral | U | established | — | Martin 1994 |
| `maxDepth` | Maximum dependency depth | count | 0 | — | neutral | system | established | — | Lakos 1996 |
| `modularity` | Modularity of the module partition | ratio | −0.5 | 1 | better | system | established | — | Newman & Girvan 2004 |
| `normalizedCumulativeComponentDependency` | Normalized CCD (NCCD) | ratio | 0 | — | worse | system | established | — | Lakos 1996 |
| `pageRank` | Relative PageRank (ComponentRank) | ratio | 0 | — | neutral | U | established | `katedrala/pagerank@1` (d = 0.85, tol 1e-10) | Inoue et al. 2005; Page et al. 1999 |
| `propagationCost` | Propagation cost | ratio | 0 | 1 | worse | system | established | `katedrala/reachability@1` (exact or estimated) | MacCormack, Rusnak & Baldwin 2006 |
| `structuralRole` | Structural role (core/shared/control/periphery/isolated) | category | — | — | neutral | U | established | `katedrala/roles@1` (adaptations K1–K5) | Baldwin, MacCormack & Rusnak 2014 |
| `transitiveDependencies` | Transitive dependencies (VFO − 1) | count | 0 | — | worse | U | established | `katedrala/reachability@1` | MacCormack, Rusnak & Baldwin 2006 |
| `transitiveDependents` | Transitive dependents (VFI − 1) | count | 0 | — | neutral | U | established | `katedrala/reachability@1` | MacCormack, Rusnak & Baldwin 2006 |
| `types` | Declared types | count | 0 | — | neutral | U | established | — | Martin 1994 |

Notes: `higherIs` describes architectural quality, so importance measures (fan-in, PageRank, gravity, transitive
dependents) are `neutral`. Modularity's lower bound is −1/2 (a known bound of Q for any partition). The
`description` of each definition states the Katedrala-specific choices from sections 2–5 in one or two sentences
(e.g. for `fanIn`: "Distinct units of the same level that depend directly on the unit (Martin's Ca counted in
units rather than classes).").

## 10. Test plan

**10.1 Golden values (unit tests, exact after rounding).**
- E1 (`simple-dependencies`): the table of section 2 (Ca, Ce, Rin, Rout, depth, raw and normalized betweenness,
  relative PageRank), `CCD = 18`, `ACD = 3`, `NCCD = 18/14`, `PC = 0.5`, `density = 1/6`, `averageFanOut = 5/6`,
  `Q = 0.04`, cross-module ratio 0.6, cohesion `src` 1/3, `services` 0, `utils` 1, module instability 1 / 0.5 / 0.
- `CCD_bbt(n)` for n = 0, 1, 2, 3, 4, 6, 7, 8, 15, 24, 100, 1 000 (section 2.11), and equality with the
  brute-force CCD of a heap-shaped tree for every n ≤ 2 000.
- Transforms: `S(k; k) = 0.5`; `A(x₀; x₀) = 0.5`, `A(1; x₀) = 1`; `Λ(X; X) = 1`, `Λ(·; 0) = 0`.
- Gravity worked examples (section 4.4) including the 3-module cycle; entropy fixture table (section 5.5) using a
  test-only directory partition; change-risk examples (section 7.2).
- Structural roles: `circular-dependencies` core = `workflow/{board,card,column}`, `shared/id.ts` shared,
  `index.ts` control; `high-fan-out` hierarchical with the K3 tie rule choosing `>` for VFO (no core).

**10.2 Properties (fast-check, random graphs up to ~60 nodes and random partitions).**
1. Ranges: every normalized term and every score in [0, 1]; `Σ weights = 1`; `|score − Σ contributions| ≤ 1e-9`;
   instability, abstractness, distance, betweenness, cohesion, cross-module ratio in [0, 1]; `P ∈ [1, M]`;
   `f ∈ [0, 0.5]`.
2. Determinism and order independence: shuffling the document's arrays (files, symbols, edges) yields a
   byte-identical `MetricsReport`; two runs are byte-identical.
3. SCC invariants: all members of a cyclic group share `Rin`, `Rout`, `depth`, VFI/VFO and structural role group.
4. Identities: `PC = CCD / n²`; `ACD = CCD / n`; `Σ_v Rout = Σ_v Rin`; for the module partition
   `Σ internal / Σ (internal + outgoing) = 1 − crossModuleDependencyRatio`; F3 contribution shares sum to 1 and
   `H(T|S) ≤ log2 M`.
5. Brute-force oracles: reach counts against a naive BFS transitive closure; `FAS_w` (DP) against enumeration of
   all orderings for module graphs of ≤ 7 nodes; the weighted greedy result is ≥ the DP optimum.
6. Monotonicity: adding a dependency `u → v` never decreases `Rin(v)`, `Ca(v)` or `spread(v)`, hence never
   decreases `v`'s reach, fan-in and spread terms; adding a file that depends on nothing and on which nothing
   depends changes no gravity term except through `n` (reach and fan-in shrink by the factor `ln(n) / ln(n + 1)`)
   and, when the level's architecture type is unchanged, no structural role in core view.
7. Zero cases: gravity = 0 iff `Ca = 0`; entropy = 0 for an edgeless graph; F1 = 0 for an acyclic file graph
   (F2 can still be > 0: module cycles need no file cycle); F3 = 0 when each module's dependencies all go to a
   single module (its own or another).
8. F2 correctness: `f = 0` iff the module graph is acyclic; reversing all edges leaves `f` unchanged.
9. Edge cases: empty document; one file; no modules; one module (F2/F3 not measurable, weights 0.6/0.4); no types
   (abstractness and distance null); a level without units (no `UnitMetrics`).

**10.3 Approximations.**
- `betweennessCentrality` with `pivots ≥ n` equals the exact result; with sampling, results are identical across
  runs; on a seeded random graph of 5 000 nodes, 256 pivots recover at least 8 of the exact top-10 units.
- Reachability with `maxExactNodes` lowered to force estimation: per-node relative error within 4 standard errors
  (`4 / √62 ≈ 51 %`) for ≥ 99 % of nodes on a 20 000-node random DAG; `reachabilityExact = false`; one
  `approximation-used` diagnostic per level.
- With the stable-hash proposal (8.2): adding one isolated node changes the pivot set by at most one node.

**10.4 Fixture expectations** (asserted from `fixtures/*/expected.json` plus module inference results):
`high-fan-in`: `core/logger.ts` has the highest file gravity and role `shared`; `high-fan-out`: the orchestrator
has role `control` and lower gravity than each file it imports; `tangled-architecture`: the highest entropy of all
fixtures and rating ≥ `moderate`, `module-cycles` ≥ watch; `clean-architecture` and `layered-architecture`:
rating `low`, no module cycles; `circular-dependencies`: three file-level cyclic groups (sizes 3, 2, 2).

**10.5 Scale and comparability (benchmarks, not unit tests).**
- Seeded synthetic graph with 100 000 nodes and 1 000 000 edges (layered DAG plus injected cycles): metrics stage
  completes within the benchmark budget, memory stays below the exact-reachability bound, approximations are
  flagged.
- Two snapshots differing by one isolated file: with exact algorithms, every other unit's gravity changes only
  through the log-share denominators (each normalized term by a factor ≥ `ln n / ln(n + 1)`, i.e. by < 0.003 at
  n ≥ 100); entropy changes only through the dilution of F1 and F4.

## 11. Proposed IR changes

Everything in sections 2–7 fits the existing types: gravity terms are `ScoreTerm`s, entropy factors are
`EntropyFactor`s with `evidence` and `contributions`, change risk is a `RiskAssessment`, indicators are
`HealthIndicator`s (all higher-is-worse), and term or factor sets that vary (coarse levels, fewer than two modules)
are visible through `terms[]` / `factors[]` and their weights. One addition is proposed.

**PROPOSED (additive, optional field; minor IR version bump).** Structural roles are a classification whose
cut-offs cannot be recovered from `UnitMetrics` (each unit's VFI/VFO can, the core values or medians and the view
used cannot). Explainability requires them:

```ts
/** Core–periphery analysis of one level (Baldwin, MacCormack & Rusnak 2014; see docs/ALGORITHMS.md). */
export interface CoreStructure {
  architecture: "core-periphery" | "borderline-core-periphery" | "multi-core" | "hierarchical";
  /** Partition used for `UnitMetrics.structuralRole`. */
  view: "core" | "median";
  /** Size of the largest and second-largest cyclic groups (0 when absent). */
  largestGroup: Count;
  secondGroup: Count;
  /** VFI/VFO cut-offs: the core's values (core view) or the medians (median view). */
  cutoffs: { visibilityFanIn: number; visibilityFanOut: number };
  /** Median view only: whether "high" means strictly above the median (Katedrala tie rule). */
  strict?: { visibilityFanIn: boolean; visibilityFanOut: boolean };
  /** Why the median view was used for a core-periphery level (core dominated by another unit). */
  reason?: string;
}

export interface SystemMetrics {
  // ...existing fields...
  /** Core–periphery structure per level (keys as in `cycles`). */
  coreStructure?: Partial<Record<AnalysisLevel, CoreStructure>>;
}
```

If the field is rejected, the same information must go into the `structuralRole` definition's description per
run, which is less precise; the recommendation is to add the field.

**Documentation corrections (no type change).**
- `UnitMetrics.distance`: state that it is Martin's normalized distance `Dn = |A + I − 1|`, not `D = Dn / √2`.
- `UnitMetrics.fanIn` / `fanOut`: state that they count distinct units of the same level (Martin counted classes).
- `UnitMetrics.cohesion`: state that it is a Katedrala ratio, not an established measure.
- Rounding: align ARCHITECTURE.md (ADR-007, "six decimals") with IR.md ("9 significant digits").

**Non-IR changes needed in `@katedrala/graph`** (sections 5.3 and 8): a weighted option for
`greedyFeedbackArcSet`; explicit betweenness sources (`sample.sources`) and id-derived ranks for the reachability
estimator, for stable sampling; optional blocked exact reachability. A shared `cycleAnomalyId` function used by the
metrics and anomalies stages (section 2.12) belongs in `@katedrala/model` or `@katedrala/ir`.

## 12. References

Each reference was checked once (bibliographic record by web search, or the full text where noted).

- **Baldwin, MacCormack & Rusnak 2014** — Baldwin, C., MacCormack, A. & Rusnak, J. (2014). Hidden structure:
  Using network methods to map system architecture. *Research Policy* 43(8):1381–1397. Also Harvard Business
  School Working Paper 13-093 (2014). *Full text of the working paper checked* (thresholds, partitions, footnote 7).
- **Brandes 2001** — Brandes, U. (2001). A faster algorithm for betweenness centrality. *Journal of Mathematical
  Sociology* 25(2):163–177.
- **Brandes & Pich 2007** — Brandes, U. & Pich, C. (2007). Centrality estimation in large networks.
  *International Journal of Bifurcation and Chaos* 17(7):2303–2318.
- **Cohen 1997** — Cohen, E. (1997). Size-estimation framework with applications to transitive closure and
  reachability. *Journal of Computer and System Sciences* 55(3):441–453.
- **Eades, Lin & Smyth 1993** — Eades, P., Lin, X. & Smyth, W. F. (1993). A fast and effective heuristic for the
  feedback arc set problem. *Information Processing Letters* 47(6):319–323.
- **Eick et al. 2001** — Eick, S. G., Graves, T. L., Karr, A. F., Marron, J. S. & Mockus, A. (2001). Does code
  decay? Assessing the evidence from change management data. *IEEE Transactions on Software Engineering*
  27(1):1–12.
- **Freeman 1977** — Freeman, L. C. (1977). A set of measures of centrality based on betweenness. *Sociometry*
  40(1):35–41.
- **Hassan 2009** — Hassan, A. E. (2009). Predicting faults using the complexity of code changes. *Proceedings of
  the 31st International Conference on Software Engineering (ICSE 2009)*, 78–88.
- **Henry & Kafura 1981** — Henry, S. & Kafura, D. (1981). Software structure metrics based on information flow.
  *IEEE Transactions on Software Engineering* SE-7(5):510–518.
- **Inoue et al. 2005** — Inoue, K., Yokomori, R., Fujiwara, H., Yamamoto, T., Matsushita, M. & Kusumoto, S.
  (2005). Ranking significance of software components based on use relations. *IEEE Transactions on Software
  Engineering* 31(3):213–225.
- **Lakos 1996** — Lakos, J. (1996). *Large-Scale C++ Software Design*. Addison-Wesley.
- **Lehman 1980** — Lehman, M. M. (1980). Programs, life cycles, and laws of software evolution. *Proceedings of
  the IEEE* 68(9):1060–1076.
- **MacCormack, Rusnak & Baldwin 2006** — MacCormack, A., Rusnak, J. & Baldwin, C. Y. (2006). Exploring the
  structure of complex software designs: An empirical study of open source and proprietary code. *Management
  Science* 52(7):1015–1030. *Full text of the working-paper version (HBS 05-016) checked* (definition, Mozilla and
  Linux values).
- **MacCormack & Sturtevant 2016** — MacCormack, A. & Sturtevant, D. J. (2016). Technical debt and system
  architecture: The impact of coupling on defect-related activity. *Journal of Systems and Software* 120:170–182.
- **Mancoridis et al. 1998** — Mancoridis, S., Mitchell, B. S., Rorres, C., Chen, Y. & Gansner, E. R. (1998).
  Using automatic clustering to produce high-level system organizations of source code. *Proceedings of the 6th
  International Workshop on Program Comprehension (IWPC '98)*, 45–52.
- **Martin 1994** — Martin, R. C. (1994). OO design quality metrics: An analysis of dependencies. Position paper,
  workshop "Pragmatic and Theoretical Directions in Object-Oriented Software Metrics", OOPSLA '94. *Full text
  checked* (definitions of Ca, Ce, I, A, D and Dn).
- **Martin 2003** — Martin, R. C. (2003). *Agile Software Development: Principles, Patterns, and Practices*.
  Prentice Hall.
- **Mitchell & Mancoridis 2006** — Mitchell, B. S. & Mancoridis, S. (2006). On the automatic modularization of
  software systems using the Bunch tool. *IEEE Transactions on Software Engineering* 32(3):193–208.
- **Mo et al. 2016** — Mo, R., Cai, Y., Kazman, R., Xiao, L. & Feng, Q. (2016). Decoupling level: A new metric
  for architectural maintenance complexity. *Proceedings of the 38th International Conference on Software
  Engineering (ICSE '16)*, Austin, TX. doi:10.1145/2884781.2884825. *Full text checked* (Table 1 percentiles,
  coefficients of variation).
- **Newman & Girvan 2004** — Newman, M. E. J. & Girvan, M. (2004). Finding and evaluating community structure in
  networks. *Physical Review E* 69(2):026113.
- **Page et al. 1999** — Page, L., Brin, S., Motwani, R. & Winograd, T. (1999). The PageRank citation ranking:
  Bringing order to the Web. Technical Report 1999-66, Stanford InfoLab. (As cited in `@katedrala/graph`.)
- **Shannon 1948** — Shannon, C. E. (1948). A mathematical theory of communication. *Bell System Technical
  Journal* 27:379–423, 623–656. (Standard reference, not re-checked.)
- **Stevens, Myers & Constantine 1974** — Stevens, W. P., Myers, G. J. & Constantine, L. L. (1974). Structured
  design. *IBM Systems Journal* 13(2):115–139. (Origin of coupling and cohesion as design criteria.)
- **Zimmermann & Nagappan 2008** — Zimmermann, T. & Nagappan, N. (2008). Predicting defects using network
  analysis on dependency graphs. *Proceedings of the 30th International Conference on Software Engineering
  (ICSE '08)*, 531–540.
