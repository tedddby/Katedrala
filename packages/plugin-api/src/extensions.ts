/**
 * Extension points beyond languages and frameworks: exporters, metrics, anomaly detectors and rule
 * evaluators. Each receives the completed (or partially completed) architecture document and an index.
 */
import type {
  AnalysisLevel,
  Anomaly,
  ArchitectureDocument,
  DocumentIndex,
  EntityId,
  MetricDefinition,
  RuleViolation,
  Severity,
} from "@katedrala/ir";

// ─── Exporters ───────────────────────────────────────────────────────────────

export interface ExportOptions {
  /** Granularity of exported nodes. */
  level: AnalysisLevel;
  /** Include external entities as nodes. */
  includeExternals: boolean;
}

/** Converts a document into another format (Graphviz DOT, Mermaid, GraphML, ...). */
export interface GraphExporter {
  /** Stable identifier used on the command line, e.g. `dot`. */
  readonly id: string;
  readonly displayName: string;
  readonly mediaType: string;
  readonly fileExtension: string;
  export(document: ArchitectureDocument, options: ExportOptions): string;
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface MetricContext {
  readonly document: ArchitectureDocument;
  readonly index: DocumentIndex;
}

export interface MetricValue {
  unit: EntityId;
  /** Metric name → value. Reported as `<provider id>.<name>` in `UnitMetrics.extensions`. */
  values: Record<string, number>;
}

/** Computes additional per-unit measurements. */
export interface MetricProvider {
  readonly id: string;
  readonly version: string;
  /** Descriptions of the metrics this provider reports (keys `<provider id>.<name>`). */
  definitions(): MetricDefinition[];
  compute(context: MetricContext): MetricValue[];
}

// ─── Anomalies & rules ───────────────────────────────────────────────────────

/** Detects additional anomaly types (which must use `x-` prefixed types). */
export interface AnomalyDetector {
  readonly id: string;
  readonly version: string;
  detect(context: MetricContext): Anomaly[];
}

/** Evaluates rules of a custom type (`x-` prefixed) declared in configuration. */
export interface RuleEvaluator {
  /** The rule type this evaluator handles, e.g. `x-acme-no-default-exports`. */
  readonly ruleType: `x-${string}`;
  evaluate(context: MetricContext, rule: CustomRuleConfig): RuleViolation[];
}

export interface CustomRuleConfig {
  id: string;
  severity: Severity;
  description?: string;
  /** The rule's configuration as written (validated by the evaluator). */
  options: Readonly<Record<string, unknown>>;
}
