/**
 * @katedrala/ir — the Katedrala Architecture Intermediate Representation.
 *
 * Types describing architecture documents and reports, stable identifier derivation, canonical ordering
 * and serialization, and a document index. This package has no dependencies and runs in any JavaScript
 * environment.
 */
export type * from "./types/common.js";
export type * from "./types/structure.js";
export type * from "./types/edges.js";
export type * from "./types/architecture.js";
export type * from "./types/metrics.js";
export type * from "./types/findings.js";
export type * from "./types/document.js";
export type * from "./types/reports.js";

export {
  ANALYSIS_LEVELS,
  ANOMALY_TYPES,
  ARCHITECTURAL_ROLES,
  DIAGNOSTIC_CODES,
  DEPENDENCY_SCOPES,
  DIRECTIONAL_ANOMALY_TYPES,
  EDGE_KINDS,
  EDGE_MECHANISMS,
  ENDPOINT_PROTOCOLS,
  ENTRY_POINT_KINDS,
  EXTENSIBLE_ENUMERATIONS,
  EXTENSION_VALUE_PATTERN,
  EXTERNAL_KINDS,
  EXTERNAL_NAMESPACES,
  FILE_ROLES,
  IMPORT_KINDS,
  RESOLUTION_METHODS,
  RULE_PROBLEM_CODES,
  RULE_TYPES,
  SEVERITIES,
  SNAPSHOT_KINDS,
  SYMBOL_CATEGORIES,
  SYMBOL_KINDS,
  SYMBOL_KIND_CATEGORY,
  SYMBOL_KIND_PRECEDENCE,
  SYMBOL_MODIFIERS,
  VCS_TYPES,
  VISIBILITIES,
  isExtensionValue,
  severityRank,
  symbolCategoryOf,
} from "./constants.js";
export {
  DOCUMENT_KINDS,
  IR_SCHEMA_VERSION,
  isCompatibleSchemaVersion,
  majorVersion,
  schemaUri,
  type DocumentKind,
} from "./version.js";
export {
  ID_PREFIXES,
  InvalidIdentifierError,
  anomalyId,
  compareStrings,
  componentId,
  declaredModuleKey,
  directionalAnomalyId,
  directoryId,
  edgeId,
  endpointId,
  entityKindOf,
  escapeNameSegment,
  externalId,
  fileId,
  inferredModuleKey,
  isEntityId,
  layerId,
  moduleId,
  normalizeRemoteUrl,
  packageId,
  parseSymbolId,
  qualifiedNameOf,
  qualifiedNameSegments,
  repositoryId,
  symbolId,
  symbolLocalName,
  unescapeNameSegment,
  violationId,
  type ExternalNamespace,
  type ParsedSymbolId,
} from "./ids.js";
export {
  PathOutsideRootError,
  ancestorsOf,
  baseName,
  extensionOf,
  isWithin,
  joinPath,
  normalizePath,
  parentPath,
  relativePath,
} from "./paths.js";
export { sha256, sha256Hex, shortHash } from "./hash.js";
export {
  DuplicateIdError,
  METRIC_SIGNIFICANT_DIGITS,
  canonicalizeDocument,
  compareEdges,
  compareLocations,
  compareProvenance,
  roundMetric,
  serializeDocument,
  serializeDocumentChunks,
  sortById,
  sortRecordKeys,
  sortedUnique,
  type SerializeOptions,
} from "./canonical.js";
export { DocumentIndex, type AnyEntity, type IndexableDocument } from "./document-index.js";
export {
  EMPTY_DIGEST,
  defaultLimits,
  emptyDocument,
  emptyEntropyReport,
  emptyMetricsReport,
  emptyRepositoryStats,
  emptySnapshot,
  emptySystemMetrics,
  fullDetail,
  type EmptyDocumentOptions,
} from "./empty.js";
