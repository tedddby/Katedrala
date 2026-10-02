/**
 * Measurements. Every aggregate score is decomposable into {@link ScoreTerm}s; raw measurements are always
 * reported next to normalized ones; every metric is described in `MetricsReport.definitions`.
 * See docs/ALGORITHMS.md for definitions and references.
 */
import type { AnalysisLevel, AnomalyId, Count, EntityId, Evidence, ScoreTerm } from "./common.js";
import type { EdgeKind } from "./edges.js";
import type { FileRole } from "./structure.js";

/** The dependency graph projection that metrics and aggregated dependencies were computed on. */
export interface ProjectionInfo {
  /** Relationship kinds counted as dependencies, sorted. */
  edgeKinds: EdgeKind[];
  /** Whether type-only relationships count as dependencies. */
  includeTypeOnly: boolean;
  /** File roles whose files are nodes of the projection (tests are excluded by default), sorted. */
  fileRoles: FileRole[];
}

/** Self-description of one metric, so consumers can present metrics they do not know. */
export interface MetricDefinition {
  /** Key as used in `UnitMetrics` (e.g. `instability`) or in `UnitMetrics.extensions` (`<provider>.<name>`). */
  key: string;
  name: string;
  description: string;
  /** Unit of the raw value, e.g. `count`, `ratio`, `score`. */
  unit: string;
  /** Lower bound of the value range, when bounded. */
  minimum?: number;
  /** Upper bound of the value range, when bounded. */
  maximum?: number;
  /** How to read the value for architectural quality. */
  higherIs: "better" | "worse" | "neutral";
  /** Levels at which the metric is reported, sorted. */
  levels: AnalysisLevel[];
  /** `katedrala` or the id of the metric provider plugin. */
  provider: string;
  /** Formula identifier and version for composite or approximated metrics, e.g. `katedrala/gravity@1`. */
  method?: string;
  /** Whether the metric is an established measure (with a reference) or a Katedrala heuristic. */
  origin: "established" | "katedrala-heuristic" | "plugin";
  /** Literature reference for established measures. */
  reference?: string;
}

export interface MetricsReport {
  projection: ProjectionInfo;
  /** Descriptions of every metric reported, sorted by key. */
  definitions: MetricDefinition[];
  system: SystemMetrics;
  entropy: EntropyReport;
  /**
   * Per-unit metrics for packages, modules, layers, components, files and symbols in the projection (symbols
   * only when `detail.symbolMetrics`), sorted by entity id.
   */
  units: UnitMetrics[];
}

/** Summary of directed cycles (strongly connected components) at one level. */
export interface CycleSummary {
  /** Strongly connected components with more than one unit, or a unit depending on itself. */
  groups: Count;
  /** Units belonging to such a component. */
  unitsInCycles: Count;
  /** Size of the largest such component. */
  largestGroup: Count;
  /** `unitsInCycles / units`; 0 when there are no units. */
  ratio: number;
}

export interface SystemMetrics {
  /** Nodes of the file-level projection. */
  files: Count;
  /** Distinct file → file dependencies in the projection. */
  dependencies: Count;
  /** `dependencies / (files × (files − 1))`; 0 when there are fewer than two files. */
  density: number;
  /** `dependencies / files`; 0 when there are no files. */
  averageFanOut: number;
  /** Cycle summaries per level (keys: `package`, `module`, `component`, `file`, ...). */
  cycles: Partial<Record<AnalysisLevel, CycleSummary>>;
  /**
   * Propagation cost (MacCormack, Rusnak & Baldwin, 2006): density of the transitive-closure ("visibility")
   * matrix including self-visibility; the average share of files a change could reach.
   */
  propagationCost: number;
  /** Whether reachability-based values are exact (false when estimated on very large graphs). */
  reachabilityExact: boolean;
  /** Lakos (1996): sum over files of the number of files each depends on transitively, including itself. */
  cumulativeComponentDependency: Count;
  /** Lakos (1996): `cumulativeComponentDependency / files`; 0 when there are no files. */
  averageComponentDependency: number;
  /**
   * Lakos (1996): cumulative component dependency divided by that of a balanced binary tree with the same
   * number of files; values well above 1 indicate tangled dependency structure. 0 when there are no files.
   */
  normalizedCumulativeComponentDependency: number;
  /** Length (in dependencies) of the longest dependency chain in the condensed (acyclic) file graph. */
  maxDepth: Count;
  /** Number of modules. */
  modules: Count;
  /**
   * Newman–Girvan modularity of the module partition on the undirected file graph; null when there are no
   * dependencies or no modules.
   */
  modularity: number | null;
  /** Share of file dependencies whose endpoints belong to different modules; 0 when there are none. */
  crossModuleDependencyRatio: number;
}

/**
 * Core–periphery role of a unit (Baldwin, MacCormack & Rusnak, 2014), from visibility fan-in (VFI) and
 * visibility fan-out (VFO):
 * - `core`: high VFI and high VFO (typically members of the largest cyclic group).
 * - `shared`: high VFI, low VFO — widely used, depends on little.
 * - `control`: low VFI, high VFO — orchestrates many others.
 * - `periphery`: low VFI and low VFO. `isolated`: no dependencies and no dependents.
 */
export type StructuralRole = "core" | "shared" | "control" | "periphery" | "isolated";

/** Metrics of one unit in its level's projection. */
export interface UnitMetrics {
  entity: EntityId;
  level: AnalysisLevel;
  /** Size of the unit (for components: its directly owned files). */
  size: {
    files: Count;
    symbols: Count;
    lines: Count;
  };
  /** Distinct units that depend directly on this unit (Martin's afferent coupling, Ca). */
  fanIn: Count;
  /** Distinct units this unit depends on directly (Martin's efferent coupling, Ce). */
  fanOut: Count;
  /** Martin's instability `Ce / (Ca + Ce)`; null when the unit has no dependencies and no dependents. */
  instability: number | null;
  /** Types declared in the unit (symbols of category `type`, except type aliases; merged declarations count once). */
  types: Count;
  /** Declared types that are abstract (`SymbolEntity.abstract`). */
  abstractTypes: Count;
  /** Martin's abstractness `abstractTypes / types`; null when `types` is 0. */
  abstractness: number | null;
  /** Martin's distance from the main sequence `|A + I − 1|`; null when A or I is null. */
  distance: number | null;
  /** Units that depend on this unit directly or transitively, excluding itself (estimated when not exact). */
  transitiveDependents: number;
  /** Units this unit depends on directly or transitively, excluding itself (estimated when not exact). */
  transitiveDependencies: number;
  /** Length of the longest dependency chain starting at this unit in the condensed graph (0 for leaves). */
  depth: Count;
  /** Normalized betweenness centrality (Freeman 1977, computed with Brandes 2001) in [0, 1]. */
  betweenness: number;
  /**
   * Relative PageRank on the dependency graph (ComponentRank, Inoue et al. 2005): PageRank × number of units,
   * so the mean is 1 independently of system size.
   */
  pageRank: number;
  structuralRole: StructuralRole;
  /**
   * For components, modules, layers and packages: share of the dependency weight of member files that stays
   * inside the unit, `internal / (internal + outgoing)`; null when member files have no dependencies.
   * Absent for files and symbols.
   */
  cohesion?: number | null;
  /** The `dependency-cycle` anomaly of the strongly connected component containing the unit, if any. */
  cycleGroup?: AnomalyId;
  gravity: GravityScore;
  /** Measurements contributed by metric plugins, keyed `<provider id>.<metric name>`. Omitted when empty. */
  extensions?: Record<string, number>;
}

/**
 * Architectural Gravity (a Katedrala heuristic, not an established metric): how structurally important a
 * unit is to the rest of the system. `score = Σ terms[i].contribution`. Method and normalization are
 * described in `MetricsReport.definitions` (key `gravity`) and docs/ALGORITHMS.md.
 */
export interface GravityScore {
  score: number;
  terms: ScoreTerm[];
}

/**
 * Architectural Entropy (a Katedrala heuristic, not an established metric): a decomposable index of
 * structural disorder in [0, 1]. `score = Σ factors[i].contribution`. See docs/ALGORITHMS.md.
 */
export interface EntropyReport {
  score: number;
  /** Banding of `score` (thresholds documented in docs/ALGORITHMS.md). */
  rating: "low" | "moderate" | "high" | "severe";
  /** Formula identifier and version, e.g. `katedrala/entropy@1`. */
  method: string;
  factors: EntropyFactor[];
}

export interface EntropyFactor extends ScoreTerm {
  /** Observations explaining the factor's raw value. */
  evidence: Evidence[];
  /**
   * Where the factor comes from: the units contributing most to its raw value, with their share of it
   * (sorted by descending share, then id; bounded). Omitted when the factor is not attributable to units.
   */
  contributions?: Array<{
    entity: EntityId;
    share: number;
  }>;
}
