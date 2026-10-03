/**
 * Constructors for empty, schema-valid documents. Producers start from these and fill in sections; tests use
 * them as minimal fixtures.
 */
import type {
  ArchitectureDocument,
  DocumentDetail,
  DocumentLimits,
  GeneratorInfo,
} from "./types/document.js";
import type { EntropyReport, MetricsReport, SystemMetrics } from "./types/metrics.js";
import type { RepositoryStats, SnapshotInfo } from "./types/structure.js";
import { repositoryId } from "./ids.js";
import { IR_SCHEMA_VERSION } from "./version.js";

/** The digest of empty input: `sha256:` + SHA-256 of the empty string. */
export const EMPTY_DIGEST =
  "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export function emptyRepositoryStats(): RepositoryStats {
  return {
    files: 0,
    analyzedFiles: 0,
    failedFiles: 0,
    directories: 0,
    packages: 0,
    symbols: 0,
    externals: 0,
    edges: 0,
    endpoints: 0,
    lines: 0,
    bytes: 0,
    unresolvedImports: 0,
    unresolvedReferences: 0,
    untypedReferences: 0,
  };
}

export function emptySystemMetrics(): SystemMetrics {
  return {
    files: 0,
    dependencies: 0,
    density: 0,
    averageFanOut: 0,
    cycles: {},
    propagationCost: 0,
    reachabilityExact: true,
    cumulativeComponentDependency: 0,
    averageComponentDependency: 0,
    normalizedCumulativeComponentDependency: 0,
    maxDepth: 0,
    modules: 0,
    modularity: null,
    crossModuleDependencyRatio: 0,
  };
}

export function emptyEntropyReport(method = "katedrala/entropy@1"): EntropyReport {
  return { score: 0, rating: "low", method, factors: [] };
}

export function emptyMetricsReport(): MetricsReport {
  return {
    projection: { edgeKinds: [], includeTypeOnly: true, fileRoles: ["source"] },
    definitions: [],
    system: emptySystemMetrics(),
    entropy: emptyEntropyReport(),
    units: [],
  };
}

/** Default document detail: everything. */
export function fullDetail(): DocumentDetail {
  return { symbols: true, relationships: "symbol", symbolMetrics: true };
}

/** Default list bounds. */
export function defaultLimits(): DocumentLimits {
  return {
    maxProvenancePerEdge: 20,
    maxLocationsPerFinding: 20,
    maxExamplesPerDependency: 5,
    maxEvidenceEntities: 10,
  };
}

export function emptySnapshot(): SnapshotInfo {
  return {
    kind: "in-memory",
    contentDigest: EMPTY_DIGEST,
    analysisDigest: EMPTY_DIGEST,
    projectConfigurationDigest: EMPTY_DIGEST,
  };
}

export interface EmptyDocumentOptions {
  repositoryName?: string;
  generator?: GeneratorInfo;
  snapshot?: SnapshotInfo;
}

/** A schema-valid document with no entities. */
export function emptyDocument(options: EmptyDocumentOptions = {}): ArchitectureDocument {
  const name = options.repositoryName ?? "repository";
  return {
    kind: "katedrala.architecture",
    schemaVersion: IR_SCHEMA_VERSION,
    generator: options.generator ?? { name: "katedrala", version: "0.0.0", adapters: [] },
    repository: {
      id: repositoryId(name),
      name,
      languages: [],
      stats: emptyRepositoryStats(),
    },
    snapshot: options.snapshot ?? emptySnapshot(),
    detail: fullDetail(),
    limits: defaultLimits(),
    directories: [],
    packages: [],
    files: [],
    symbols: [],
    externals: [],
    edges: [],
    entryPoints: [],
    components: [],
    modules: [],
    layers: [],
    endpoints: [],
    metrics: emptyMetricsReport(),
    anomalies: [],
    violations: [],
    rules: { results: [] },
    diagnostics: [],
  };
}
