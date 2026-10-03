import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  TYPESCRIPT_ADAPTER_ID,
  TypeScriptAdapterOptionsError,
  createTypeScriptAdapter,
  type TypeScriptAdapterOptions,
} from "@katedrala/adapter-typescript";
import {
  ConfigurationError,
  FileSystemExtractionCache,
  WorkingTreeSource,
  adapterOptionsDigest,
  contentHash,
  createPathMatcher,
  decodeText,
  defaultCacheDirectory,
  digestOf,
  discoverFiles,
  extractFiles,
  prepareProjects,
  resolveCoreSettings,
  sortDiagnostics,
  type DiscoveredFile,
  type EffectiveCoreSettings,
  type ExtractionCache,
  type FileOutcome,
} from "@katedrala/core";
import {
  IR_SCHEMA_VERSION,
  compareStrings,
  defaultLimits,
  fileId,
  fullDetail,
  type ArchitectureDocument,
  type Diagnostic,
  type DocumentDetail,
  type DocumentLimits,
  type EntryPointEntry,
  type RunInfo,
  type SnapshotInfo,
  type ToolVersion,
} from "@katedrala/ir";
import { link, type LinkFile } from "@katedrala/linker";
import { ArchitectureModel } from "@katedrala/model";
import type { LanguageAdapter, Logger, SnapshotSource } from "@katedrala/plugin-api";
import type { z } from "zod";
import { loadSnapshotConfiguration, type SnapshotConfiguration } from "./configuration.js";
import {
  analysisDigest,
  contentDigest,
  outsideDocumentLines,
  repositoryIdentity,
} from "./identity.js";
import { KATEDRALA_VERSION } from "./version.js";

/** Pipeline stages, in execution order; also the keys of `RunInfo.timings`. */
export const ANALYSIS_STAGES = [
  "listing",
  "configuration",
  "discovery",
  "extraction",
  "projects",
  "linking",
] as const;

export type AnalysisStage = (typeof ANALYSIS_STAGES)[number];

export interface AnalysisProgress {
  readonly stage: AnalysisStage;
  /** Extraction stage only: files with an outcome so far. */
  readonly completed?: number;
  /** Extraction stage only: files to process. */
  readonly total?: number;
}

export interface AnalyzeOptions {
  /** Directory to analyze (default: the working directory). Ignored for listing when `source` is given. */
  readonly root?: string;
  /** Snapshot to analyze instead of the working tree at `root` (e.g. a git revision or an in-memory tree). */
  readonly source?: SnapshotSource;
  /**
   * Configuration file to use instead of the snapshot's own (relative to `root`). Unlike the snapshot's own
   * configuration, it may choose the cache location (`cache.dir`, relative to `root`).
   */
  readonly configPath?: string;
  /** List working-tree files with git (honours `.gitignore`, records the revision). Default `true`. */
  readonly useGit?: boolean;
  /** Language adapters (default: the TypeScript/JavaScript adapter configured from `languages.typescript`). */
  readonly adapters?: readonly LanguageAdapter[];
  /**
   * Extraction cache instance, or `false` to disable caching (default: on disk, unless the configuration
   * sets `cache.enabled: false`).
   */
  readonly cache?: ExtractionCache | false;
  /**
   * Directory of the on-disk extraction cache (absolute, or relative to the working directory). Default:
   * `cache.dir` of the {@link configPath} configuration, else the user cache directory (see
   * `defaultCacheDirectory`, which honours `KATEDRALA_CACHE_DIR`). The cache location is the user's
   * choice: `cache.dir` in the analyzed snapshot's own configuration is ignored (with a
   * `configuration-warning`), so that a repository can neither make the analysis write outside its root
   * nor supply cache entries of its own.
   */
  readonly cacheDirectory?: string;
  /** Maximum parser worker threads (1 parses in the main thread). */
  readonly concurrency?: number;
  /** Overrides of the document detail. */
  readonly detail?: Partial<DocumentDetail>;
  /** Overrides of the document limits. */
  readonly limits?: Partial<DocumentLimits>;
  /** Extra exclude globs, applied in addition to the configured ones. */
  readonly exclude?: readonly string[];
  /** Validators for configuration sections owned by plugins or later pipeline stages. */
  readonly configurationSections?: Readonly<Record<string, z.ZodType>>;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: AnalysisProgress) => void;
  readonly logger?: Logger;
}

/** The observed structure of a repository: the structural sections of an architecture document. */
export type StructureDocument = Pick<
  ArchitectureDocument,
  | "schemaVersion"
  | "generator"
  | "repository"
  | "snapshot"
  | "detail"
  | "limits"
  | "directories"
  | "packages"
  | "files"
  | "symbols"
  | "externals"
  | "edges"
  | "entryPoints"
  | "diagnostics"
>;

export interface StructureAnalysis {
  /** Canonical structural sections (every array in IR order). */
  readonly document: StructureDocument;
  /** Graph model over the document, for projections and graph algorithms. */
  readonly model: ArchitectureModel;
  /** Volatile facts about this run (timings, cache, workers); never part of the document's identity. */
  readonly run: RunInfo;
  readonly configuration: SnapshotConfiguration;
  readonly settings: EffectiveCoreSettings;
}

/**
 * Analyze the structure of a repository: list the snapshot, load its configuration, discover and classify
 * files, extract each file with its language adapter (cached, in parallel), prepare project knowledge
 * (manifests, module resolution) and link everything into files, symbols, typed edges, packages and
 * externals.
 *
 * This is the observed-structure stage of the analysis. Architecture inference, metrics, anomalies and rule
 * evaluation build on its result.
 */
export async function analyzeStructure(options: AnalyzeOptions = {}): Promise<StructureAnalysis> {
  const startedAt = new Date();
  const start = performance.now();
  const timings: Record<string, number> = {};
  const root = resolve(options.root ?? ".");
  const { signal, logger } = options;
  let stageStart = start;
  const enter = (stage: AnalysisStage): void => {
    signal?.throwIfAborted();
    options.onProgress?.({ stage });
    stageStart = performance.now();
  };
  const leave = (stage: AnalysisStage): void => {
    timings[stage] = Math.round(performance.now() - stageStart);
  };

  enter("listing");
  const source =
    options.source ??
    (await WorkingTreeSource.open(root, {
      useGit: options.useGit ?? true,
      ...(logger === undefined ? {} : { logger }),
    }));
  try {
    const entries = await source.list();
    const skipped = await source.skipped();
    leave("listing");

    enter("configuration");
    const configuration = await loadSnapshotConfiguration({
      source,
      entries,
      root,
      ...(options.configPath === undefined ? {} : { explicitPath: options.configPath }),
      ...(options.configurationSections === undefined
        ? {}
        : { sections: options.configurationSections }),
    });
    const { settings, diagnostics: settingsDiagnostics } = effectiveSettings(
      configuration,
      options,
    );
    const adapterSetup = options.adapters
      ? { adapters: options.adapters, diagnostics: [] }
      : defaultAdapters(settings, configuration);
    const adapters = adapterSetup.adapters;
    const detail = resolveDetail(settings, options.detail);
    const limits = resolveLimits(settings, options.limits);
    leave("configuration");

    enter("discovery");
    const discovered = discoverFiles(
      entries,
      {
        include: settings.include,
        exclude: [...settings.exclude, ...(options.exclude ?? [])],
        roles: settings.roles,
        maxFileSize: settings.maxFileSize,
      },
      adapters,
    );
    leave("discovery");

    enter("extraction");
    const cacheSetup = resolveCache(options, settings, root, logger);
    const extraction = await extractFiles(source, discovered, adapters, {
      maxFileSize: settings.maxFileSize,
      ...(cacheSetup.cache === undefined ? {} : { cache: cacheSetup.cache }),
      ...(options.concurrency === undefined ? {} : { concurrency: options.concurrency }),
      ...(signal === undefined ? {} : { signal }),
      ...(logger === undefined ? {} : { logger }),
      ...(options.onProgress === undefined
        ? {}
        : {
            onProgress: (progress) => {
              options.onProgress?.({
                stage: "extraction",
                completed: progress.completed,
                total: progress.total,
              });
            },
          }),
    });
    leave("extraction");

    enter("projects");
    const recording = recordingSource(source);
    const prepared = await prepareProjects(recording.source, entries, adapters, {
      ...(logger === undefined ? {} : { logger }),
    });
    leave("projects");

    enter("linking");
    const files = linkFilesOf(discovered, extraction.results);
    const remote = await source.remote();
    const subdirectory = await source.subdirectory();
    const identity = repositoryIdentity({
      ...(settings.name === undefined ? {} : { configuredName: settings.name }),
      packages: prepared.projects.flatMap((prepared) => prepared.project.packages),
      ...(remote === undefined ? {} : { remote }),
      versionControlled: subdirectory !== undefined,
    });
    const linked = await link({
      files,
      projects: prepared.projects,
      repositoryName: identity.name,
      detail,
      limits,
    });
    leave("linking");

    const revision = await source.revision();
    const snapshot: SnapshotInfo = {
      kind: source.kind,
      ...(revision === undefined ? {} : { revision }),
      ...(subdirectory === undefined ? {} : { subdirectory }),
      contentDigest: contentDigest(linked.files),
      analysisDigest: analysisDigest({
        katedrala: KATEDRALA_VERSION,
        schemaVersion: IR_SCHEMA_VERSION,
        configuration: JSON.parse(configuration.canonicalJson) as unknown,
        detail,
        limits,
        exclude: [...(options.exclude ?? [])].sort(compareStrings),
        adapters: adapters
          .map((adapter) => ({
            id: adapter.id,
            version: adapter.version,
            options: adapterOptionsDigest(adapter.options),
          }))
          .sort((a, b) => compareStrings(a.id, b.id)),
        plugins: [],
        // The content digest covers the document's files only. What else the analysis saw goes here, in
        // the analysis digest: project configuration read outside those files (above the root, or
        // excluded by `include` / `exclude`), excluded files that discovery and resolution still see, and
        // skipped links (see `outsideDocumentLines`). `projectConfigurationDigest` alone is not part of
        // either digest, so equal content and analysis digests still mean identical documents.
        outsideDocument: digestOf(
          outsideDocumentLines({
            listed: entries.map((entry) => entry.path),
            skipped,
            files: linked.files,
            reads: textHashes(recording.reads),
            ancestorReads: textHashes(recording.ancestorReads),
          }),
        ),
      }),
      projectConfigurationDigest: prepared.projectConfigurationDigest,
    };

    const entryPoints = mergeEntryPoints(
      linked.entryPoints,
      configuredEntryPoints(files, settings.entryPoints, configuration),
    );
    const diagnostics = sortDiagnostics([
      ...configuration.diagnostics,
      ...settingsDiagnostics,
      ...adapterSetup.diagnostics,
      ...skipped.map(skippedDiagnostic),
      ...extraction.diagnostics,
      ...prepared.diagnostics,
      ...linked.diagnostics,
    ]);

    const document: StructureDocument = {
      schemaVersion: IR_SCHEMA_VERSION,
      generator: {
        name: "katedrala",
        version: KATEDRALA_VERSION,
        adapters: processingAdapters(extraction.results),
      },
      repository: {
        id: identity.id,
        name: identity.name,
        ...(identity.vcs === undefined ? {} : { vcs: identity.vcs }),
        languages: linked.languages,
        // Endpoints come from framework detectors, which run after this stage.
        stats: { ...linked.stats, endpoints: 0 },
      },
      snapshot,
      detail,
      limits,
      directories: linked.directories,
      packages: linked.packages,
      files: linked.files,
      symbols: linked.symbols,
      externals: linked.externals,
      edges: linked.edges,
      entryPoints,
      diagnostics,
    };

    const run: RunInfo = {
      startedAt: startedAt.toISOString(),
      durationMs: Math.round(performance.now() - start),
      timings,
      cache: {
        enabled: cacheSetup.cache !== undefined,
        hits: extraction.stats.cacheHits,
        misses: extraction.stats.cacheMisses,
      },
      // Core counts started worker threads; the IR uses 1 for in-process parsing.
      workers: Math.max(1, extraction.stats.workers),
      platform: { node: process.versions.node, os: process.platform, arch: process.arch },
    };

    return {
      document,
      model: ArchitectureModel.from(document),
      run,
      configuration,
      settings,
    };
  } finally {
    if (options.source === undefined) await source.close();
  }
}

interface AdapterSetup {
  readonly adapters: readonly LanguageAdapter[];
  readonly diagnostics: readonly Diagnostic[];
}

/** The built-in adapters, configured from the `languages` section. */
function defaultAdapters(
  settings: EffectiveCoreSettings,
  configuration: SnapshotConfiguration,
): AdapterSetup {
  const diagnostics: Diagnostic[] = [];
  for (const id of Object.keys(settings.languages)) {
    if (id === TYPESCRIPT_ADAPTER_ID) continue;
    diagnostics.push({
      code: "configuration-warning",
      severity: "warning",
      message: `Options for language adapter "${id}" are ignored: no such adapter is installed`,
      ...(configuration.inSnapshot && configuration.path !== undefined
        ? { file: fileId(configuration.path) }
        : {}),
    });
  }
  const options = settings.languages[TYPESCRIPT_ADAPTER_ID] as TypeScriptAdapterOptions | undefined;
  try {
    return { adapters: [createTypeScriptAdapter(options)], diagnostics };
  } catch (error) {
    if (error instanceof TypeScriptAdapterOptionsError) {
      throw new ConfigurationError(
        [{ path: `languages.${TYPESCRIPT_ADAPTER_ID}`, message: error.message }],
        configuration.path,
        { cause: error },
      );
    }
    throw error;
  }
}

function resolveDetail(
  settings: EffectiveCoreSettings,
  override: Partial<DocumentDetail> | undefined,
): DocumentDetail {
  const base = fullDetail();
  const symbols = override?.symbols ?? base.symbols;
  return {
    symbols,
    // Without symbols every relationship is necessarily between files.
    relationships: symbols ? (override?.relationships ?? settings.detail) : "file",
    symbolMetrics: symbols && (override?.symbolMetrics ?? base.symbolMetrics),
  };
}

function resolveLimits(
  settings: EffectiveCoreSettings,
  override: Partial<DocumentLimits> | undefined,
): DocumentLimits {
  const base = defaultLimits();
  return {
    maxProvenancePerEdge:
      override?.maxProvenancePerEdge === undefined
        ? settings.maxProvenancePerEdge
        : override.maxProvenancePerEdge,
    maxLocationsPerFinding: override?.maxLocationsPerFinding ?? base.maxLocationsPerFinding,
    maxExamplesPerDependency: override?.maxExamplesPerDependency ?? base.maxExamplesPerDependency,
    maxEvidenceEntities: override?.maxEvidenceEntities ?? base.maxEvidenceEntities,
  };
}

/**
 * The core settings in effect. `cache.dir` is honoured only from a configuration the caller chose
 * (`configPath`): the cache location is a user setting, and a repository that could choose it could make
 * the analysis write anywhere the user can, or point it at forged cache entries of its own. A `cache.dir`
 * in the snapshot's own configuration is dropped with a `configuration-warning`, whatever the cache
 * options of this run (the document never depends on them); `cache.enabled: false` is honoured.
 */
function effectiveSettings(
  configuration: SnapshotConfiguration,
  options: AnalyzeOptions,
): { settings: EffectiveCoreSettings; diagnostics: Diagnostic[] } {
  const settings = resolveCoreSettings(configuration.config);
  if (options.configPath !== undefined || settings.cache.dir === undefined) {
    return { settings, diagnostics: [] };
  }
  return {
    settings: { ...settings, cache: { enabled: settings.cache.enabled } },
    diagnostics: [
      {
        code: "configuration-warning",
        severity: "warning",
        message:
          'The setting "cache.dir" is ignored: the cache location is chosen by the user (the cacheDirectory option or KATEDRALA_CACHE_DIR), never by the analyzed repository',
        ...(configuration.inSnapshot && configuration.path !== undefined
          ? { file: fileId(configuration.path) }
          : {}),
      },
    ],
  };
}

function resolveCache(
  options: AnalyzeOptions,
  settings: EffectiveCoreSettings,
  root: string,
  logger: Logger | undefined,
): { cache?: ExtractionCache } {
  if (options.cache === false) return {};
  if (options.cache !== undefined) return { cache: options.cache };
  if (!settings.cache.enabled) return {};
  // `settings.cache.dir` only survives from a configuration the caller chose (see `effectiveSettings`).
  const directory =
    options.cacheDirectory !== undefined
      ? resolve(options.cacheDirectory)
      : settings.cache.dir !== undefined
        ? resolve(root, settings.cache.dir)
        : defaultCacheDirectory();
  return {
    cache: new FileSystemExtractionCache(directory, logger === undefined ? {} : { logger }),
  };
}

/** A view of a snapshot source that records what is read through it (contents as returned). */
interface RecordingSource {
  readonly source: SnapshotSource;
  /** Listed files read: path → content, or undefined when the read failed. */
  readonly reads: ReadonlyMap<string, Uint8Array | undefined>;
  /** Files read above the root: path from the top level → content, or undefined when absent. */
  readonly ancestorReads: ReadonlyMap<string, Uint8Array | undefined>;
}

function recordingSource(source: SnapshotSource): RecordingSource {
  const reads = new Map<string, Uint8Array | undefined>();
  const ancestorReads = new Map<string, Uint8Array | undefined>();
  const recording: SnapshotSource = {
    kind: source.kind,
    description: source.description,
    revision: () => source.revision(),
    subdirectory: () => source.subdirectory(),
    remote: () => source.remote(),
    list: () => source.list(),
    skipped: () => source.skipped(),
    read: async (path) => {
      try {
        const bytes = await source.read(path);
        reads.set(path, bytes);
        return bytes;
      } catch (error) {
        reads.set(path, undefined);
        throw error;
      }
    },
    readAncestor: async (path) => {
      try {
        const bytes = await source.readAncestor(path);
        ancestorReads.set(path, bytes);
        return bytes;
      } catch (error) {
        ancestorReads.set(path, undefined);
        throw error;
      }
    },
    close: () => source.close(),
  };
  return { source: recording, reads, ancestorReads };
}

/** Content hashes of recorded reads as adapters saw them: undefined for absent, failed or binary content. */
function textHashes(
  reads: ReadonlyMap<string, Uint8Array | undefined>,
): Map<string, string | undefined> {
  const hashes = new Map<string, string | undefined>();
  for (const [path, bytes] of reads) {
    const decoded = bytes === undefined ? undefined : decodeText(bytes);
    hashes.set(
      path,
      decoded === undefined || decoded.binary ? undefined : contentHash(decoded.text),
    );
  }
  return hashes;
}

/** Join discovery and extraction results into linker input (one entry per discovered file, same order). */
function linkFilesOf(
  discovered: readonly DiscoveredFile[],
  outcomes: readonly FileOutcome[],
): LinkFile[] {
  const byPath = new Map(outcomes.map((outcome) => [outcome.path, outcome]));
  return discovered.map((file) => {
    const outcome = byPath.get(file.path);
    if (outcome === undefined)
      throw new Error(`Internal error: no extraction outcome for ${file.path}`);
    const linkFile: LinkFile = {
      path: file.path,
      size: file.size,
      language: file.language,
      role: outcome.generated === true ? "generated" : file.role,
      status: outcome.status,
    };
    if (file.dialect !== undefined) linkFile.dialect = file.dialect;
    if (outcome.reason !== undefined) linkFile.reason = outcome.reason;
    if (outcome.adapter !== undefined) linkFile.adapter = outcome.adapter;
    if (outcome.lines !== undefined) linkFile.lines = outcome.lines;
    if (outcome.hash !== undefined) linkFile.hash = outcome.hash;
    if (outcome.extraction !== undefined) linkFile.extraction = outcome.extraction;
    return linkFile;
  });
}

/** Adapters that processed at least one file, sorted by id. */
function processingAdapters(outcomes: readonly FileOutcome[]): ToolVersion[] {
  const byKey = new Map<string, ToolVersion>();
  for (const outcome of outcomes) {
    if (outcome.adapter === undefined) continue;
    byKey.set(`${outcome.adapter.id}\u0000${outcome.adapter.version}`, outcome.adapter);
  }
  return [...byKey.values()].sort(
    (a, b) => compareStrings(a.id, b.id) || compareStrings(a.version, b.version),
  );
}

/**
 * Entry points configured with `entry_points`. Their `source` names the snapshot's own configuration file
 * (`katedrala.config.yaml#entry_points`); a configuration the caller supplied (`configPath`) is named
 * `configuration#entry_points`, since where it lies on the analyzing machine is not part of the snapshot.
 */
function configuredEntryPoints(
  files: readonly LinkFile[],
  globs: readonly string[],
  configuration: SnapshotConfiguration,
): EntryPointEntry[] {
  if (globs.length === 0) return [];
  const matches = createPathMatcher(globs);
  const declaredIn =
    configuration.inSnapshot && configuration.path !== undefined
      ? configuration.path
      : "configuration";
  const source = `${declaredIn}#entry_points`;
  return files
    .filter((file) => matches(file.path))
    .map((file) => ({ entity: fileId(file.path), kind: "configuration", source }));
}

/** `entryPoints` order: by entity, kind, source, package, then `mappedFrom` (as `canonicalizeDocument`). */
function compareEntryPoints(a: EntryPointEntry, b: EntryPointEntry): number {
  return (
    compareStrings(a.entity, b.entity) ||
    compareStrings(a.kind, b.kind) ||
    compareStrings(a.source, b.source) ||
    compareStrings(a.package ?? "", b.package ?? "") ||
    compareStrings(a.mappedFrom ?? "", b.mappedFrom ?? "")
  );
}

/**
 * Union of entry points in IR order without exact duplicates. Entries that differ only in `package` or
 * `mappedFrom` are distinct (two manifests can declare the same file under the same field).
 */
function mergeEntryPoints(...lists: readonly (readonly EntryPointEntry[])[]): EntryPointEntry[] {
  const sorted = lists.flat().sort(compareEntryPoints);
  return sorted.filter(
    (entry, index) => index === 0 || compareEntryPoints(sorted[index - 1] ?? entry, entry) !== 0,
  );
}

function skippedDiagnostic(path: string): Diagnostic {
  return {
    code: "symlink-skipped",
    severity: "info",
    message: `Not analyzed: ${path} is a symbolic link or junction (links are never followed)`,
  };
}
