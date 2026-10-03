/**
 * Effective (fully defaulted) core settings derived from a validated configuration.
 */
import { compareStrings, FILE_ROLES, type FileRole } from "@katedrala/ir";
import {
  DEFAULT_MAX_FILE_SIZE,
  DEFAULT_MAX_PROVENANCE_PER_EDGE,
  type CoreConfiguration,
} from "./schema.js";

/** Every core setting with its default applied. Values are plain data, so they can feed digests. */
export interface EffectiveCoreSettings {
  /** The configured repository name, when configured. */
  readonly name?: string;
  /** Include globs; `["**"]` (every file) when the configuration lists none. */
  readonly include: readonly string[];
  /** Exclude globs (default none). */
  readonly exclude: readonly string[];
  /** Globs forcing each file role (every role present; empty when not configured), in `FILE_ROLES` order. */
  readonly roles: Readonly<Record<FileRole, readonly string[]>>;
  /** Files larger than this many bytes are not parsed. */
  readonly maxFileSize: number;
  /** Relationship detail of the document. */
  readonly detail: "symbol" | "file";
  /** Whether test files are nodes of the metrics projection. */
  readonly includeTestsInMetrics: boolean;
  /** Whether type-only relationships count as dependencies. */
  readonly includeTypeOnly: boolean;
  /** Maximum provenance entries per edge; `null` means unbounded. */
  readonly maxProvenancePerEdge: number | null;
  /** Options per adapter id (keys sorted; empty when not configured). */
  readonly languages: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  /**
   * Extraction cache settings; `dir` (as configured, relative to the analysis root) when configured. The
   * engine honours `dir` only from an explicit configuration file (`AnalyzeOptions.configPath`) and ignores
   * it, with a `configuration-warning`, in the analyzed snapshot's own configuration.
   */
  readonly cache: { readonly enabled: boolean; readonly dir?: string };
  /** Entry point globs. */
  readonly entryPoints: readonly string[];
}

/**
 * Apply the defaults to the core sections of a validated configuration (see `loadConfiguration`). The input
 * is not modified; arrays are copied.
 */
export function resolveCoreSettings(config: CoreConfiguration): EffectiveCoreSettings {
  const roles = {} as Record<FileRole, readonly string[]>;
  for (const role of FILE_ROLES) roles[role] = [...(config.roles?.[role] ?? [])];
  const languages: Record<string, Readonly<Record<string, unknown>>> = {};
  for (const id of Object.keys(config.languages ?? {}).sort(compareStrings)) {
    languages[id] = { ...config.languages?.[id] };
  }
  const include = config.include ?? [];
  const settings: EffectiveCoreSettings = {
    include: include.length === 0 ? ["**"] : [...include],
    exclude: [...(config.exclude ?? [])],
    roles,
    maxFileSize: config.analysis?.max_file_size ?? DEFAULT_MAX_FILE_SIZE,
    detail: config.analysis?.detail ?? "symbol",
    includeTestsInMetrics: config.analysis?.include_tests_in_metrics ?? false,
    includeTypeOnly: config.analysis?.include_type_only ?? true,
    maxProvenancePerEdge:
      config.analysis?.max_provenance_per_edge === undefined
        ? DEFAULT_MAX_PROVENANCE_PER_EDGE
        : config.analysis.max_provenance_per_edge,
    languages,
    cache: {
      enabled: config.cache?.enabled ?? true,
      ...(config.cache?.dir === undefined ? {} : { dir: config.cache.dir }),
    },
    entryPoints: [...(config.entry_points ?? [])],
  };
  return config.name === undefined ? settings : { name: config.name, ...settings };
}
