/**
 * Reports produced by Katedrala commands other than `analyze`. Each report is a standalone, versioned,
 * machine-readable document with its own `kind` discriminator and the shared {@link DocumentHeader}.
 */
import type {
  AnalysisLevel,
  AnomalyId,
  ComponentId,
  Confidence,
  Count,
  EdgeId,
  EndpointId,
  EntityId,
  EntityKind,
  EntityRef,
  Evidence,
  ExternalId,
  FileId,
  InferenceInfo,
  LayerId,
  ModuleId,
  PackageId,
  Range,
  ScoreTerm,
  SeverityCounts,
  Severity,
  SymbolId,
} from "./common.js";
import type { AnalysisCompleteness, DocumentHeader, GeneratorInfo } from "./document.js";
import type { EdgeKind, EdgeKindCounts } from "./edges.js";
import type { Anomaly, RuleViolation, RulesSummary } from "./findings.js";
import type { EntropyReport, StructuralRole, UnitMetrics } from "./metrics.js";
import type { ExternalKind, FileRole, RevisionInfo, RoleEntry, SnapshotInfo } from "./structure.js";

// ─── Impact ──────────────────────────────────────────────────────────────────

/**
 * Change impact ("blast radius"). Impacted entities form a shortest-path tree toward the target: each entry
 * names its next step (`next`); following `next` from any entry reaches the target. When several shortest
 * paths exist, the step with the highest confidence is chosen, then the smallest entity id.
 */
export interface ImpactReport extends DocumentHeader {
  kind: "katedrala.impact";
  snapshot: SnapshotInfo;
  analysis: AnalysisCompleteness;
  /** The query as given by the user (name, path or id). */
  query: string;
  target: EntityRef;
  options: ImpactOptionsInfo;
  summary: ImpactSummary;
  /** Impacted files and symbols, sorted by distance, then id. */
  impacted: ImpactedEntity[];
  /** Impact grouped by module, sorted by minimum distance, then id. */
  modules: ImpactedGroup[];
  /** Endpoints whose handlers are impacted, sorted by distance, then id. */
  endpoints: ImpactedEndpoint[];
  /** External systems involved, sorted by external id, then relation. */
  externalIntegrations: ExternalIntegration[];
  /** Overall change risk, decomposed. */
  risk: RiskAssessment;
  /** Qualitative risk notes, sorted by id. */
  riskNotes: RiskNote[];
}

export interface ImpactOptionsInfo {
  /** Relationship kinds followed, sorted. */
  edgeKinds: EdgeKind[];
  includeTypeOnly: boolean;
  includeTests: boolean;
  /** Whether dependents of implemented interfaces / overridden base members are included (dispatch). */
  followDispatch: boolean;
  /** Maximum dependency distance followed; absent when unbounded. */
  maxDepth?: Count;
}

export interface ImpactSummary {
  /** Files containing at least one direct dependent of the target. */
  directFiles: Count;
  /** Symbols that depend on the target directly. */
  directSymbols: Count;
  files: Count;
  symbols: Count;
  modules: Count;
  components: Count;
  packages: Count;
  /** Test files among the impacted files. */
  tests: Count;
  endpoints: Count;
  externalIntegrations: Count;
  /** Largest dependency distance among impacted entities. */
  maxDistance: Count;
  /** Unresolved imports and references inside the impacted files: the result may be incomplete if > 0. */
  unresolvedInScope: Count;
}

/** How one entity relates to the next one on its way to the target. */
export interface ImpactStep {
  /** The next entity toward the target. */
  to: EntityId;
  /**
   * An edge kind (`to` is depended upon through an edge), `contains` (the entity contains `to`, e.g. a file
   * and its symbol), `contained-in` (the entity is a member of `to`), or `dispatch` (the entity depends on an
   * interface or base member that `to` implements or overrides).
   */
  relation: EdgeKind | "contains" | "contained-in" | "dispatch";
  /** The underlying edge, for edge relations. */
  edge?: EdgeId;
}

export interface ImpactedEntity {
  id: FileId | SymbolId;
  kind: EntityKind;
  name: string;
  /** Number of steps between this entity and the target (1 = direct dependent). */
  distance: Count;
  /** Lowest confidence along the explanation path. */
  confidence: Confidence;
  /** Next step toward the target. */
  next: ImpactStep;
  file: FileId;
  fileRole: FileRole;
  module?: ModuleId;
}

export interface ImpactedGroup {
  module: ModuleId;
  name: string;
  files: Count;
  symbols: Count;
  minDistance: Count;
}

export interface ImpactedEndpoint {
  endpoint: EndpointId;
  method: string;
  path: string;
  handler: FileId | SymbolId;
  /** Distance of the handler from the target. */
  distance: Count;
}

export interface ExternalIntegration {
  external: ExternalId;
  kind: ExternalKind;
  name: string;
  /**
   * `target`: the target itself depends on the external system. `dependent`: an impacted entity does.
   */
  relation: "target" | "dependent";
  /** Entities that hold the relationship, sorted, bounded. */
  via: EntityId[];
}

export interface RiskAssessment {
  score: number;
  rating: "low" | "medium" | "high" | "critical";
  /** Formula identifier and version, e.g. `katedrala/change-risk@1`. */
  method: string;
  terms: ScoreTerm[];
}

/** A qualitative, evidence-backed remark about risk. */
export interface RiskNote {
  /** Stable kebab-case identifier, e.g. `high-fan-in`, `cross-module-dependents`. */
  id: string;
  title: string;
  description: string;
  evidence: Evidence[];
}

// ─── Diff ────────────────────────────────────────────────────────────────────

/**
 * Comparison of two architecture documents. Entities are matched before comparison: files through renames
 * (identical digests or version-control rename detection), symbols through their files' renames, modules by
 * id and otherwise by similarity of member files. Every added/removed/resolved list excludes matched entities,
 * and identifiers of the base are mapped through the matches before relationships, cycles, anomalies and
 * violations are compared.
 */
export interface DiffReport extends DocumentHeader {
  kind: "katedrala.diff";
  base: DiffSide;
  head: DiffSide;
  /** Whether the two documents were produced comparably; metric deltas are unreliable when not. */
  comparability: {
    comparable: boolean;
    /** Human-readable differences (e.g. "entropy method differs: katedrala/entropy@1 vs @2"). */
    differences: string[];
  };
  summary: DiffSummary;
  files: {
    added: FileId[];
    removed: FileId[];
    /** Present in both (after renames) with a different content digest. */
    modified: FileId[];
    renamed: FileRename[];
  };
  symbols: {
    added: SymbolId[];
    removed: SymbolId[];
    /** Same qualified name and kind in a renamed file. */
    moved: Array<{ from: SymbolId; to: SymbolId }>;
    changed: SymbolChange[];
  };
  modules: {
    added: ModuleSnapshotRef[];
    removed: ModuleSnapshotRef[];
    /** Modules present in both snapshots (same id, or matched by member similarity). */
    matched: ModuleMatch[];
  };
  /** Dependency changes per level (keys: `package`, `module`, `component`, `file`, ...). */
  dependencies: Partial<Record<AnalysisLevel, DependencyDelta>>;
  cycles: {
    added: CycleRef[];
    removed: CycleRef[];
    changed: CycleChange[];
  };
  entropy: ScoreDelta;
  /** Units whose gravity changed by at least `gravityThreshold`, by descending |delta|, then id. */
  gravity: GravityChange[];
  /** Minimum absolute gravity change reported. */
  gravityThreshold: number;
  violations: {
    added: RuleViolation[];
    resolved: ResolvedViolation[];
  };
  anomalies: {
    added: Anomaly[];
    resolved: Anomaly[];
    /** Same type with overlapping subjects but a different identity (e.g. a growing cycle). */
    changed: AnomalyChange[];
  };
}

export interface DiffSide {
  snapshot: SnapshotInfo;
  generator: GeneratorInfo;
  schemaVersion: string;
}

export interface DiffSummary {
  filesAdded: Count;
  filesRemoved: Count;
  filesModified: Count;
  filesRenamed: Count;
  modulesAdded: Count;
  modulesRemoved: Count;
  modulesChanged: Count;
  moduleDependenciesAdded: Count;
  moduleDependenciesRemoved: Count;
  cyclesAdded: Count;
  cyclesRemoved: Count;
  cyclesChanged: Count;
  violationsAdded: Count;
  violationsResolved: Count;
  anomaliesAdded: Count;
  anomaliesResolved: Count;
  entropyDelta: number;
}

export interface FileRename {
  from: FileId;
  to: FileId;
  /** 1 for identical content. */
  similarity: number;
  method: "content-digest" | "version-control" | "symbol-similarity";
}

export interface SymbolChange {
  id: SymbolId;
  /** What changed, sorted. */
  changes: Array<"kind" | "exported" | "visibility" | "signature" | "abstract">;
}

export interface ModuleSnapshotRef {
  id: ModuleId;
  name: string;
  files: Count;
}

export interface ModuleMatch {
  base: ModuleId;
  head: ModuleId;
  /** Jaccard similarity of the member file sets (after renames). */
  similarity: number;
  filesAdded: FileId[];
  filesRemoved: FileId[];
  publicApiAdded: FileId[];
  publicApiRemoved: FileId[];
}

export interface DependencyChange {
  source: EntityId;
  target: EntityId;
  /** Relationship kinds present (in head for added, in base for removed), sorted. */
  kinds: EdgeKind[];
  edgeCount: Count;
  /** True when every underlying edge is type-only. */
  typeOnly: boolean;
}

export interface DependencyModification {
  source: EntityId;
  target: EntityId;
  kindsAdded: EdgeKind[];
  kindsRemoved: EdgeKind[];
  typeOnly: {
    base: boolean;
    head: boolean;
  };
  edgeCount: {
    base: Count;
    head: Count;
  };
}

export interface DependencyDelta {
  added: DependencyChange[];
  removed: DependencyChange[];
  changed: DependencyModification[];
}

export interface CycleRef {
  level: AnalysisLevel;
  /** Members, sorted by id. */
  members: EntityId[];
  anomaly?: AnomalyId;
}

export interface CycleChange {
  level: AnalysisLevel;
  base: AnomalyId;
  head: AnomalyId;
  membersAdded: EntityId[];
  membersRemoved: EntityId[];
}

export interface AnomalyChange {
  type: string;
  base: AnomalyId;
  head: AnomalyId;
  subjectsAdded: EntityId[];
  subjectsRemoved: EntityId[];
  severity: {
    base: Severity;
    head: Severity;
  };
}

export interface ResolvedViolation {
  violation: RuleViolation;
  /**
   * `fixed`: the rule is unchanged and the violation is gone. `rule-removed` / `rule-changed`: the rule was
   * deleted or edited. `entity-removed`: the violating code no longer exists.
   */
  reason: "fixed" | "rule-removed" | "rule-changed" | "entity-removed";
}

export interface ScoreDelta {
  method: {
    base: string;
    head: string;
  };
  base: number;
  head: number;
  delta: number;
  terms: TermDelta[];
}

export interface TermDelta {
  signal: string;
  /** Contribution in the base snapshot. */
  base: number;
  /** Contribution in the head snapshot. */
  head: number;
  delta: number;
}

/** A compact snapshot of one score term. */
export interface TermValue {
  signal: string;
  normalized: number;
  contribution: number;
}

export interface GravityChange {
  entity: EntityId;
  level: AnalysisLevel;
  name: string;
  /** null when the unit does not exist in that snapshot. */
  base: number | null;
  head: number | null;
  delta: number;
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface HealthReport extends DocumentHeader {
  kind: "katedrala.health";
  snapshot: SnapshotInfo;
  analysis: AnalysisCompleteness;
  entropy: EntropyReport;
  /** Comparison against an earlier snapshot, when one was requested. */
  baseline?: {
    snapshot: SnapshotInfo;
    entropy: EntropyReport;
    delta: ScoreDelta;
  };
  indicators: HealthIndicator[];
  /** Units with the highest gravity, highest first (ties by id), bounded. */
  hotspots: Hotspot[];
  findings: {
    anomalies: SeverityCounts;
    violations: SeverityCounts;
  };
}

export interface HealthIndicator {
  /** Stable kebab-case identifier, e.g. `propagation-cost`. */
  id: string;
  name: string;
  value: number;
  /** Unit of `value`, e.g. `ratio`, `count`. */
  unit: string;
  /** Interpretation band. */
  status: "ok" | "watch" | "concern";
  /** Values at or above which the indicator is `watch` / `concern` (for indicators where higher is worse). */
  thresholds: {
    watch: number;
    concern: number;
  };
  description: string;
}

export interface Hotspot {
  entity: EntityId;
  level: AnalysisLevel;
  name: string;
  gravity: number;
  structuralRole: StructuralRole;
  reasons: string[];
}

// ─── Explain ─────────────────────────────────────────────────────────────────

export interface ExplainReport extends DocumentHeader {
  kind: "katedrala.explain";
  snapshot: SnapshotInfo;
  analysis: AnalysisCompleteness;
  query: string;
  target: EntityRef;
  location?: {
    file: FileId;
    range?: Range;
  };
  membership: {
    file?: FileId;
    component?: ComponentId;
    module?: ModuleId;
    layer?: LayerId;
    package?: PackageId;
  };
  /** Structural role assessment derived from metrics. */
  role: RoleAssessment;
  /** Architectural roles assigned by detectors, naming or configuration. */
  roles: RoleEntry[];
  metrics?: UnitMetrics;
  dependencies: RelationshipSummary;
  dependents: RelationshipSummary;
  /** Endpoints the target handles (directly or through its members), sorted. */
  endpoints: EndpointId[];
  impact: ImpactSummary;
  riskNotes: RiskNote[];
  anomalies: Anomaly[];
  violations: RuleViolation[];
  /** Why the target exists as inferred, for inferred modules and layers. */
  inference?: InferenceInfo;
}

export interface RoleAssessment {
  /** Short classification, e.g. `high-centrality hub`, `shared utility`, `peripheral leaf`. */
  classification: string;
  structuralRole?: StructuralRole;
  summary: string;
  evidence: Evidence[];
}

export interface RelationshipSummary {
  /** Distinct entities on the other side. */
  total: Count;
  kindCounts: EdgeKindCounts;
  /** Distinct modules on the other side (excluding the target's own module). */
  modules: Count;
  /** Most strongly connected entities, by descending observations then id, bounded. */
  top: EntityRef[];
}

// ─── Validation ──────────────────────────────────────────────────────────────

export interface ValidationReport extends DocumentHeader {
  kind: "katedrala.validation";
  snapshot: SnapshotInfo;
  analysis: AnalysisCompleteness;
  /** Lowest violation severity that fails validation; `never` reports without failing. */
  failOn: Severity | "never";
  /** Whether an incomplete analysis (failed files, unresolved imports) fails validation. */
  failOnIncomplete: boolean;
  /** Whether the analysis was complete (no failed files and no unresolved imports). */
  complete: boolean;
  passed: boolean;
  summary: {
    rules: Count;
    violations: Count;
    bySeverity: SeverityCounts;
    /** Rules with configuration problems (e.g. selectors matching nothing). */
    rulesWithProblems: Count;
  };
  rules: RulesSummary;
  violations: RuleViolation[];
}

// ─── History ─────────────────────────────────────────────────────────────────

export interface HistoryReport extends DocumentHeader {
  kind: "katedrala.history";
  selection: HistorySelection;
  /** Analyzed revisions, oldest first. */
  points: HistoryPoint[];
}

export interface HistorySelection {
  /** How commits were walked, e.g. `first-parent`. */
  strategy: string;
  /** Oldest revision considered, as a commit hash, when bounded. */
  from?: string;
  /** Newest revision considered, as a commit hash. */
  to: string;
  /** Every n-th commit was analyzed. */
  step: Count;
  maxPoints: Count;
}

export interface HistoryPoint {
  revision: RevisionInfo;
  analysisDigest: string;
  stats: {
    files: Count;
    symbols: Count;
    edges: Count;
    modules: Count;
    packages: Count;
  };
  entropy: {
    method: string;
    score: number;
    factors: TermValue[];
  };
  /** Number of cyclic groups per level. */
  cycles: Partial<Record<AnalysisLevel, Count>>;
  anomalies: SeverityCounts;
  violations: SeverityCounts;
  /** Changes relative to the previous point; absent for the first point. */
  changes?: {
    filesAdded: Count;
    filesRemoved: Count;
    filesModified: Count;
    filesRenamed: Count;
    moduleDependenciesAdded: Count;
    moduleDependenciesRemoved: Count;
  };
}
