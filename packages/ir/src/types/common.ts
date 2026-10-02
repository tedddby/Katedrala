/**
 * Shared primitives of the Katedrala Architecture IR.
 *
 * Normative conventions (see docs/IR.md for the full specification):
 * - Paths are POSIX-style, relative to the analysis root, without a leading "./" or "/" and without a
 *   trailing "/". The analysis root itself has the path "" (empty string).
 * - Lines and columns are 1-based. Columns count UTF-16 code units (the unit of JavaScript strings and of the
 *   Language Server Protocol's default position encoding). A {@link Range} end position is exclusive.
 * - Positions refer to the file's normalized text: UTF-8 decoded, byte-order mark removed, line endings
 *   (CRLF, CR) converted to LF.
 * - Confidence values are in the closed interval [0, 1] and express strength of support, not a calibrated
 *   probability.
 * - Absent optional field: not applicable or no value. `null`: applicable but not computable (documented per
 *   field). Arrays are always present, except on high-cardinality entities (symbols, provenance) where empty
 *   arrays are omitted as documented per field.
 * - Arrays are sorted by a documented total order (see docs/IR.md, "Ordering"); string comparison is by
 *   UTF-16 code units (JavaScript's default comparison), independent of locale.
 * - Tolerant reading: consumers must ignore properties they do not know and must treat enumeration values
 *   they do not know as an "other" value, because minor schema versions add both.
 */

// ─── Identifiers ─────────────────────────────────────────────────────────────

/** `repo:<normalized remote>` (e.g. `repo:github.com/acme/shop`) or `repo:<name>`. */
export type RepositoryId = `repo:${string}`;
/** `dir:<path>`; the analysis root is `dir:`. */
export type DirectoryId = `dir:${string}`;
/** `file:<path>` */
export type FileId = `file:${string}`;
/** `sym:<escaped file path>#<qualified name>[~<disambiguator>]` */
export type SymbolId = `sym:${string}`;
/** `pkg:<ecosystem>:<manifest directory>`, e.g. `pkg:npm:packages/api`; the root manifest is `pkg:npm:`. */
export type PackageId = `pkg:${string}`;
/** `ext:<namespace>:<name>`, e.g. `ext:npm:react`, `ext:node:fs`, `ext:env:DATABASE_URL`. */
export type ExternalId = `ext:${string}`;
/** `cmp:<path>`; a component rooted at the analysis root is `cmp:`. */
export type ComponentId = `cmp:${string}`;
/** `mod:<module key>`: the configured name, or the anchor of an inferred module (see docs/IR.md). */
export type ModuleId = `mod:${string}`;
/** `layer:<name>` */
export type LayerId = `layer:${string}`;
/** `endpoint:<16 lowercase hex digits>`, derived from method, path and handler. */
export type EndpointId = `endpoint:${string}`;
/** `edge:<16 lowercase hex digits>`, derived from the edge's kind, source and target. */
export type EdgeId = `edge:${string}`;
/** `anomaly:<type>:<16 lowercase hex digits>` */
export type AnomalyId = `anomaly:${string}`;
/** `violation:<rule id>:<16 lowercase hex digits>` */
export type ViolationId = `violation:${string}`;

/** Entities that can be the endpoint of a relationship ({@link EdgeEntity}). */
export type NodeId = FileId | SymbolId | PackageId | ExternalId;

/** Any addressable architectural entity. */
export type EntityId =
  | RepositoryId
  | DirectoryId
  | FileId
  | SymbolId
  | PackageId
  | ExternalId
  | ComponentId
  | ModuleId
  | LayerId
  | EndpointId;

/** The kind of entity an identifier denotes; determined by the identifier's prefix. */
export type EntityKind =
  | "repository"
  | "directory"
  | "file"
  | "symbol"
  | "package"
  | "external"
  | "component"
  | "module"
  | "layer"
  | "endpoint";

// ─── Values ──────────────────────────────────────────────────────────────────

/**
 * A value in the closed interval [0, 1] expressing how strongly evidence supports a conclusion.
 * @minimum 0
 * @maximum 1
 */
export type Confidence = number;

/**
 * A 1-based line number.
 * @asType integer
 * @minimum 1
 */
export type LineNumber = number;

/**
 * A 1-based column number in UTF-16 code units.
 * @asType integer
 * @minimum 1
 */
export type ColumnNumber = number;

/**
 * A non-negative integer count.
 * @asType integer
 * @minimum 0
 */
export type Count = number;

/** Severity shared by diagnostics, anomalies and rule violations. Ordered `info` < `warning` < `error`. */
export type Severity = "info" | "warning" | "error";

/** Number of items per severity. */
export interface SeverityCounts {
  info: Count;
  warning: Count;
  error: Count;
}

/**
 * Granularity at which a conclusion or a measurement applies.
 * `system` denotes the whole analyzed snapshot.
 */
export type AnalysisLevel =
  "system" | "package" | "module" | "layer" | "component" | "file" | "symbol";

/** Language identifier, e.g. `typescript`, `javascript`, `json`, `markdown`, or `unknown`. */
export type LanguageId = string;

/** A position in a source file. */
export interface Position {
  line: LineNumber;
  column: ColumnNumber;
}

/** A contiguous region of a source file. `end` is exclusive. */
export interface Range {
  start: Position;
  end: Position;
}

/** A point in a specific file. */
export interface SourceLocation {
  file: FileId;
  line: LineNumber;
  column: ColumnNumber;
}

/**
 * One measurable observation supporting a conclusion. Machine-readable (`signal`, `value`) and
 * human-readable (`description`).
 */
export interface Evidence {
  /** Stable kebab-case identifier of the signal, e.g. `internal-dependency-ratio`. */
  signal: string;
  /** A complete sentence explaining the observation, e.g. "87% of dependencies stay within the cluster". */
  description: string;
  /** The measured value, when the signal is numeric. */
  value?: number;
  /** The relative weight of this signal in the conclusion, when the conclusion is a weighted aggregate. */
  weight?: number;
  /**
   * Entities that exemplify the observation: sorted, and bounded by `limits.maxEvidenceEntities`
   * (selection: sort by id, then truncate).
   */
  entities?: EntityId[];
}

/**
 * Explanation attached to every inferred (as opposed to directly observed) conclusion. Inference is
 * heuristic: `confidence` expresses how strongly the evidence supports the conclusion.
 */
export interface InferenceInfo {
  confidence: Confidence;
  /** Identifier and version of the inference method, e.g. `katedrala/module-clustering@1`. */
  method: string;
  /** One-sentence summary of why the conclusion was reached. */
  reason: string;
  /** The observations the conclusion is based on, strongest first (ties broken by `signal`). */
  evidence: Evidence[];
}

/**
 * One term of a decomposable score (Architectural Gravity, Architectural Entropy, risk scores).
 * `contribution = weight × normalized` and `score = Σ contribution` (after rounding, within 1e-9).
 */
export interface ScoreTerm {
  /** Stable kebab-case identifier of the signal, e.g. `reach`. */
  signal: string;
  /** The measurement before normalization, in its natural unit. */
  raw: number;
  /** The measurement mapped to [0, 1] by a documented, snapshot-independent transform. */
  normalized: number;
  /** Weight of the term; the weights of one score sum to 1. */
  weight: number;
  /** `weight × normalized`. */
  contribution: number;
  /** Short explanation of what the raw value means. */
  description?: string;
}

/** A reference to an entity together with a human-readable label, used in reports. */
export interface EntityRef {
  id: EntityId;
  kind: EntityKind;
  /** Display name (symbol name, file path, module name, ...). */
  name: string;
}
