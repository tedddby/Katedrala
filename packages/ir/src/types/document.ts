/**
 * The root of an architecture analysis (one snapshot of one repository), and the header shared by reports.
 */
import type { ComponentEntity, EndpointEntity, LayerEntity, ModuleEntity } from "./architecture.js";
import type { Count, SeverityCounts } from "./common.js";
import type { EdgeEntity } from "./edges.js";
import type { Anomaly, Diagnostic, RuleViolation, RulesSummary } from "./findings.js";
import type { MetricsReport } from "./metrics.js";
import type {
  DirectoryEntity,
  EntryPointEntry,
  ExternalEntity,
  FileEntity,
  PackageEntity,
  RepositoryInfo,
  SnapshotInfo,
  SymbolEntity,
} from "./structure.js";

/** Name and version of a tool component (an adapter or a plugin). */
export interface ToolVersion {
  id: string;
  version: string;
}

/** The tool that produced a document or report. */
export interface GeneratorInfo {
  name: "katedrala";
  /** Katedrala version (semver). */
  version: string;
  /** Language adapters that processed files, sorted by id. */
  adapters: ToolVersion[];
  /** Plugins that contributed to the result, sorted by id. Omitted when none. */
  plugins?: ToolVersion[];
}

/**
 * How much detail a document contains. Large repositories may be analyzed at file granularity to keep
 * documents small; consumers use this to distinguish "omitted" from "none".
 */
export interface DocumentDetail {
  /** Whether `symbols` lists declarations. When false, `symbols` is empty and file `symbols` lists are empty. */
  symbols: boolean;
  /**
   * `symbol`: code relationships keep symbol endpoints. `file`: symbol endpoints are lifted to their files
   * (and aggregated), so every edge connects files, packages and externals.
   */
  relationships: "symbol" | "file";
  /** Whether `metrics.units` includes symbol-level metrics. */
  symbolMetrics: boolean;
}

/** Bounds applied to lists in the document. Every bounded list documents which bound applies. */
export interface DocumentLimits {
  /** Maximum provenance entries per edge; null means unbounded. */
  maxProvenancePerEdge: Count | null;
  /** Maximum `locations` per anomaly or violation. */
  maxLocationsPerFinding: Count;
  /** Maximum `examples` per aggregated dependency. */
  maxExamplesPerDependency: Count;
  /** Maximum `entities` per evidence item. */
  maxEvidenceEntities: Count;
}

/**
 * Information about one run that is not determined by the inputs (timings, timestamps, cache usage, the
 * command line). Excluded from determinism guarantees and from serialization unless requested.
 */
export interface RunInfo {
  /**
   * ISO-8601 UTC timestamp.
   * @format date-time
   */
  startedAt: string;
  durationMs: number;
  /** Wall-clock milliseconds per pipeline stage. */
  timings: Record<string, number>;
  cache: {
    enabled: boolean;
    hits: Count;
    misses: Count;
  };
  /** Number of parallel workers used for parsing (1 = in-process). */
  workers: Count;
  platform: {
    node: string;
    os: string;
    arch: string;
  };
  /** Revisions as the user wrote them (e.g. `HEAD~1`), when the run analyzed git revisions. */
  requestedRevisions?: string[];
}

/** Fields shared by every document and report. */
export interface DocumentHeader {
  /** URI of the JSON Schema the document conforms to. */
  $schema?: string;
  /** Semantic version of the IR schema (not of Katedrala). */
  schemaVersion: string;
  generator: GeneratorInfo;
}

/**
 * The Katedrala architecture document (`katedrala analyze --format json`).
 *
 * Determinism: for identical inputs (content, configuration, Katedrala version) every field except `run`
 * is identical, byte for byte when serialized with `serializeDocument`.
 */
export interface ArchitectureDocument extends DocumentHeader {
  kind: "katedrala.architecture";
  repository: RepositoryInfo;
  snapshot: SnapshotInfo;
  detail: DocumentDetail;
  limits: DocumentLimits;

  // Structure (observed)
  directories: DirectoryEntity[];
  packages: PackageEntity[];
  files: FileEntity[];
  symbols: SymbolEntity[];
  externals: ExternalEntity[];
  /** Sorted by source, then target, then kind. */
  edges: EdgeEntity[];
  /** Sorted by entity, then kind, then source. */
  entryPoints: EntryPointEntry[];

  // Architecture (derived and inferred)
  components: ComponentEntity[];
  modules: ModuleEntity[];
  /** Sorted by rank, then id. */
  layers: LayerEntity[];
  endpoints: EndpointEntity[];

  // Measurements and findings
  metrics: MetricsReport;
  anomalies: Anomaly[];
  violations: RuleViolation[];
  rules: RulesSummary;
  diagnostics: Diagnostic[];

  run?: RunInfo;
}

/**
 * How complete the underlying analysis was. Reports carry it so a consumer (e.g. a CI gate) can refuse to
 * trust results of a broken run.
 */
export interface AnalysisCompleteness {
  files: Count;
  analyzedFiles: Count;
  failedFiles: Count;
  unresolvedImports: Count;
  unresolvedReferences: Count;
  diagnostics: SeverityCounts;
}
