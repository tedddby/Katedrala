/**
 * Findings: anomalies (detected structural risks), rule violations (breaches of user-declared constraints)
 * and diagnostics (problems encountered while analyzing).
 *
 * Katedrala never labels code "bad". Anomalies are evidence-backed observations that often indicate risk;
 * violations are objective breaches of rules the user configured.
 */
import type {
  AnalysisLevel,
  AnomalyId,
  ColumnNumber,
  Confidence,
  Count,
  EdgeId,
  EntityId,
  Evidence,
  FileId,
  LineNumber,
  Severity,
  SourceLocation,
  ViolationId,
} from "./common.js";

/**
 * Anomaly types. Values prefixed with `x-` are reserved for plugins.
 * Directional types (marked →) set `source` and `target`; the others describe a set of `subjects`.
 * - `dependency-cycle`: one strongly connected component (subjects: its members).
 * - `god-component`: a unit with outlying size, fan-in and/or fan-out (subjects: the unit).
 * - `hub`: a unit with outlying centrality (subjects: the unit).
 * - `boundary-bypass` →: a unit uses another module's internals although the module declares entry points.
 * - `upward-dependency` →: a dependency against the expected layer direction.
 * - `unstable-dependency` →: a dependency on a less stable unit (Stable Dependencies Principle).
 * - `coupled-cluster`: a group of units with outlying mutual dependency density (subjects: the group).
 * - `orphan`: a unit with no meaningful connectivity that is not a known entry point (subjects: the unit).
 * - `zone-of-pain`: concrete and stable with many dependents (subjects: the unit).
 * - `zone-of-uselessness`: abstract and unstable (subjects: the unit).
 * - `undeclared-dependency` →: a package used by code but not declared by the owning manifest.
 */
export type AnomalyType =
  | "dependency-cycle"
  | "god-component"
  | "hub"
  | "boundary-bypass"
  | "upward-dependency"
  | "unstable-dependency"
  | "coupled-cluster"
  | "orphan"
  | "zone-of-pain"
  | "zone-of-uselessness"
  | "undeclared-dependency"
  | `x-${string}`;

export interface Anomaly {
  /**
   * Directional types: `anomaly:<type>:` + hash of `"<source>\n<target>"`. Other types: hash of the sorted
   * subject ids joined by `"\n"`. See docs/IR.md.
   */
  id: AnomalyId;
  type: AnomalyType;
  severity: Severity;
  level: AnalysisLevel;
  /** Every entity involved, sorted by id. */
  subjects: EntityId[];
  /** For directional types: the depending unit. */
  source?: EntityId;
  /** For directional types: the depended-upon unit. */
  target?: EntityId;
  /** Short title, e.g. "Dependency cycle between 3 modules". */
  title: string;
  /** Explanation in complete sentences. */
  description: string;
  /** Strongest first (ties broken by signal). For cycles, includes representative cycle paths. */
  evidence: Evidence[];
  /** How strongly the evidence supports the anomaly. */
  confidence: Confidence;
  /** Relationships that constitute the anomaly (e.g. the edges inside a cycle), sorted. */
  edges: EdgeId[];
  /** Places to look at, sorted, truncated to `limits.maxLocationsPerFinding`. */
  locations: SourceLocation[];
  /** A concrete, evidence-based suggestion, when one exists. */
  suggestion?: string;
}

/**
 * Rule types (see docs/RULES.md). Values prefixed with `x-` are reserved for plugins.
 * - `forbidden-dependency`: sources must not depend on targets.
 * - `allowed-dependency`: sources may only depend on the listed targets.
 * - `layer-order`: dependencies must follow the declared layer order.
 * - `module-isolation`: a module must not depend on (or be depended on by) other modules.
 * - `dependency-direction`: dependencies between two groups may only point one way.
 * - `max-fan-out` / `max-fan-in`: upper bounds on direct dependencies / dependents.
 * - `no-cycles`: no dependency cycles within the scope.
 * - `public-api`: other units may only depend on a unit through its declared entry points.
 */
export type RuleType =
  | "forbidden-dependency"
  | "allowed-dependency"
  | "layer-order"
  | "module-isolation"
  | "dependency-direction"
  | "max-fan-out"
  | "max-fan-in"
  | "no-cycles"
  | "public-api"
  | `x-${string}`;

/**
 * A breach of a configured rule. Dependency rules are evaluated on the file-level graph by default and yield
 * one violation per (rule, source file, target file) carrying every underlying edge.
 */
export interface RuleViolation {
  /**
   * `violation:<rule id>:` + hash of `"<rule>\n<source>\n<target or empty>\n<discriminator or empty>"`; the
   * discriminator is a stable identity component (e.g. the cycle's anomaly id), never a measured value.
   */
  id: ViolationId;
  rule: string;
  ruleType: RuleType;
  severity: Severity;
  /** The violating unit. */
  source: EntityId;
  /** The depended-upon unit, for dependency rules. */
  target?: EntityId;
  /** Every entity involved, for rules about groups (e.g. the members of a forbidden cycle), sorted. */
  subjects?: EntityId[];
  /** Human-readable explanation, e.g. "OrderController depends on OrderRepository". */
  message: string;
  /** Relationships that constitute the violation, sorted. */
  edges: EdgeId[];
  /** Source locations of the violating relationships, sorted, truncated to `limits.maxLocationsPerFinding`. */
  locations: SourceLocation[];
  evidence: Evidence[];
}

/** Codes of rule configuration problems. Values prefixed with `x-` are reserved for plugins. */
export type RuleProblemCode =
  "no-matching-sources" | "no-matching-targets" | "unknown-selector" | `x-${string}`;

/** A configuration problem detected while evaluating a rule. */
export interface RuleProblem {
  code: RuleProblemCode;
  message: string;
}

/** Outcome of evaluating one configured rule. */
export interface RuleResult {
  rule: string;
  ruleType: RuleType;
  severity: Severity;
  description?: string;
  /** `sha256:<hex>` of the normalized rule definition; changes when the rule is edited. */
  digest: string;
  /** Number of violations of this rule. */
  violations: Count;
  /** Units matched by the rule's source selector (0 usually indicates a misconfigured selector). */
  matchedSources: Count;
  /** Units matched by the rule's target selector, for dependency rules. */
  matchedTargets?: Count;
  /** Configuration problems, e.g. selectors that match nothing. Omitted when none. */
  problems?: RuleProblem[];
}

export interface RulesSummary {
  /** Path of the configuration file the rules came from, relative to the analysis root. */
  configuration?: string;
  /** One entry per configured rule, in configuration order. */
  results: RuleResult[];
}

/** Diagnostic codes. Values prefixed with `x-` are reserved for plugins. */
export type DiagnosticCode =
  | "syntax-error"
  | "read-failed"
  | "parse-failed"
  | "file-too-large"
  | "unresolved-import"
  | "invalid-manifest"
  | "invalid-project-configuration"
  | "configuration-warning"
  | "duplicate-package-name"
  | "symlink-skipped"
  | "limit-reached"
  | "approximation-used"
  | "plugin-error"
  | `x-${string}`;

/** A problem encountered while analyzing, sorted by file, line, column, code, then message. */
export interface Diagnostic {
  code: DiagnosticCode;
  severity: Severity;
  message: string;
  file?: FileId;
  line?: LineNumber;
  column?: ColumnNumber;
}
