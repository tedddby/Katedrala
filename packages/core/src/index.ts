/**
 * @katedrala/core — everything between "a directory or snapshot" and "per-file extractions plus adapter
 * projects": configuration, snapshot sources, file discovery and classification, text normalization and
 * digests, extraction (in-process and in worker threads), the extraction cache and project preparation.
 *
 * Linking is done by `@katedrala/linker`; orchestration of a whole analysis by `@katedrala/engine`.
 */

// Text normalization and digests
export {
  BINARY_DETECTION_BYTES,
  contentHash,
  decodeText,
  digestOf,
  isBinaryContent,
  lineCount,
  normalizeLineEndings,
  type DecodedText,
} from "./text/text.js";

// Snapshot sources
export {
  ALWAYS_EXCLUDED_NAMES,
  SnapshotSourceError,
  type SnapshotSourceErrorCode,
} from "./sources/errors.js";
export {
  InMemorySource,
  type InMemoryContent,
  type InMemorySourceOptions,
} from "./sources/in-memory.js";
export { WorkingTreeSource, type WorkingTreeSourceOptions } from "./sources/working-tree.js";

// Configuration
export {
  CORE_CONFIGURATION_SECTIONS,
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_PROVENANCE_PER_EDGE,
  RESERVED_CONFIGURATION_SECTIONS,
  createConfigurationSchema,
  type AnalysisConfiguration,
  type CacheConfiguration,
  type CoreConfiguration,
  type KatedralaConfig,
  type RolesConfiguration,
} from "./config/schema.js";
export {
  CONFIGURATION_FILE_NAMES,
  ConfigurationError,
  formatConfigurationIssue,
  loadConfiguration,
  parseConfiguration,
  type ConfigurationIssue,
  type LoadConfigurationOptions,
  type LoadedConfiguration,
  type ParseConfigurationOptions,
  type ParsedConfiguration,
} from "./config/load.js";
export type { ConfigurationFormat } from "./config/document.js";
export { resolveCoreSettings, type EffectiveCoreSettings } from "./config/settings.js";

// Discovery and classification
export {
  discoverFiles,
  type DiscoveredFile,
  type DiscoverySettings,
  type SkipReason,
} from "./discovery/discover.js";
export { createPathMatcher, type PathMatcher } from "./discovery/globs.js";
export {
  BUILTIN_LANGUAGE_EXTENSIONS,
  builtinLanguageOf,
  isTextLikePath,
} from "./discovery/languages.js";
export {
  heuristicRole,
  isManifestName,
  packageRootsOf,
  type RoleHeuristicContext,
} from "./discovery/roles.js";

// Extraction cache
export { MemoryExtractionCache, isFileExtraction, type ExtractionCache } from "./cache/cache.js";
export {
  CACHE_FORMAT_VERSION,
  adapterOptionsDigest,
  extractionCacheKey,
  type ExtractionCacheKeyInput,
} from "./cache/key.js";
export {
  FileSystemExtractionCache,
  type FileSystemExtractionCacheOptions,
} from "./cache/file-system.js";
export { defaultCacheDirectory, type CacheDirectoryEnvironment } from "./cache/directory.js";

// Extraction
export {
  defaultWorkerCount,
  extractFiles,
  type ExtractionOptions,
  type ExtractionProgress,
  type ExtractionResults,
  type ExtractionStats,
  type FileOutcome,
  type FileStatus,
} from "./extraction/extract.js";
export {
  GENERATED_MARKER_LINES,
  generatedMarkerLine,
  hasGeneratedMarker,
} from "./extraction/generated.js";
export { initializeAdapter } from "./extraction/adapters.js";

// Project preparation
export {
  prepareProjects,
  type PrepareProjectsOptions,
  type PreparedProject,
  type PreparedProjects,
} from "./project/prepare.js";

// Utilities
export { canonicalJson } from "./util/canonical-json.js";
export { compareDiagnostics, sortDiagnostics } from "./util/diagnostics.js";
