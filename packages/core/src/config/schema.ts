/**
 * The Katedrala configuration file (`katedrala.config.yaml`) and its validation.
 *
 * Keys are snake_case, as is customary for YAML configuration (ADR-010). `@katedrala/core` owns the sections
 * typed here; sections of later milestones (groups, modules, layers, rules, inference, metrics, anomalies,
 * frameworks, plugins) are accepted only when their owner registers a validator with
 * {@link createConfigurationSchema}. Unknown top-level keys are errors (typo protection) except keys starting
 * with `x-`, which are free-form.
 */
import { compareStrings, FILE_ROLES, type FileRole } from "@katedrala/ir";
import { z } from "zod";
import { globPatternProblem } from "../discovery/globs.js";

/** Default `analysis.max_file_size` in bytes (1 MiB). */
export const DEFAULT_MAX_FILE_SIZE = 1_048_576;

/** Default `analysis.max_provenance_per_edge`. */
export const DEFAULT_MAX_PROVENANCE_PER_EDGE = 20;

/** Top-level sections owned and validated by `@katedrala/core`. */
export const CORE_CONFIGURATION_SECTIONS = [
  "name",
  "include",
  "exclude",
  "roles",
  "analysis",
  "languages",
  "cache",
  "entry_points",
] as const;

/**
 * Top-level sections owned by later milestones. They are accepted only when a validator is registered for
 * them (see {@link createConfigurationSchema}); otherwise they are reported as unsupported.
 */
export const RESERVED_CONFIGURATION_SECTIONS = [
  "groups",
  "modules",
  "layers",
  "rules",
  "inference",
  "metrics",
  "anomalies",
  "frameworks",
  "plugins",
] as const;

/**
 * Globs forcing a file role (picomatch syntax, relative to the analysis root). A file takes the first role,
 * in this order, whose globs match it; configured roles override the classification heuristics.
 */
export interface RolesConfiguration {
  /** Production code. */
  source?: string[];
  /** Test code. */
  test?: string[];
  /** Type declarations only (e.g. `*.d.ts`). */
  declaration?: string[];
  /** Tool or build configuration. */
  configuration?: string[];
  /** Build and maintenance scripts. */
  script?: string[];
  /** Generated code (not parsed). */
  generated?: string[];
  /** Third-party code copied into the repository (not parsed). */
  vendored?: string[];
  /** Documentation. */
  documentation?: string[];
  /** Images, fonts, audio and video. */
  asset?: string[];
  /** Data files. */
  data?: string[];
  /** Anything else. */
  other?: string[];
}

/** The `analysis` section. */
export interface AnalysisConfiguration {
  /** Files larger than this many bytes are not parsed (default 1048576). */
  max_file_size?: number;
  /** `symbol` keeps symbol-level relationships; `file` lifts them to files for compact documents. */
  detail?: "symbol" | "file";
  /** Whether test files are nodes of the metrics projection (default false). */
  include_tests_in_metrics?: boolean;
  /** Whether type-only relationships count as dependencies (default true). */
  include_type_only?: boolean;
  /** Maximum provenance entries per edge; `null` keeps every observation (default 20). */
  max_provenance_per_edge?: number | null;
}

/** The `cache` section. */
export interface CacheConfiguration {
  /** Whether the extraction cache is used (default true). */
  enabled?: boolean;
  /**
   * Cache directory, absolute or relative to the analysis root (default: the user cache directory). Honoured
   * only from a configuration file the caller names explicitly (`AnalyzeOptions.configPath`); in the analyzed
   * snapshot's own configuration it is ignored with a `configuration-warning`, so that a repository can
   * neither make the analysis write outside its root nor supply cache entries of its own.
   */
  dir?: string;
}

/** The sections of the configuration owned by `@katedrala/core`. */
export interface CoreConfiguration {
  /** Repository name, used for the repository identifier when there is no `origin` remote. */
  name?: string;
  /** Only files matching one of these globs are analyzed (default: every file). */
  include?: string[];
  /** Files matching one of these globs are not analyzed. */
  exclude?: string[];
  /** Globs forcing file roles. */
  roles?: RolesConfiguration;
  /** Analysis options. */
  analysis?: AnalysisConfiguration;
  /** Options per language adapter, keyed by adapter id (e.g. `typescript`). */
  languages?: Record<string, Record<string, unknown>>;
  /** Extraction cache options. */
  cache?: CacheConfiguration;
  /** Globs of files that are entry points into the code. */
  entry_points?: string[];
}

/**
 * A validated configuration: the core sections, plus registered sections and `x-` keys (whose types are
 * owned by their validators) under their own keys.
 */
export type KatedralaConfig = CoreConfiguration & { readonly [section: string]: unknown };

/** A glob discovery can use: not blank, and nothing `globPatternProblem` rejects (`./`, `!`, `/dist`, `a{`). */
const globSchema = z
  .string({ error: "Expected a glob pattern (string)" })
  .superRefine((glob, context) => {
    const problem =
      glob.trim() === "" ? "Expected a non-empty glob pattern" : globPatternProblem(glob);
    if (problem !== undefined) context.addIssue({ code: "custom", message: problem });
  });

const globListSchema = z.array(globSchema, { error: "Expected a list of glob patterns" });

const rolesShape = Object.fromEntries(
  FILE_ROLES.map((role) => [role, globListSchema.optional()]),
) as Record<FileRole, z.ZodOptional<typeof globListSchema>>;

const coreShape = {
  name: z
    .string({ error: "Expected a string" })
    .refine((name) => name.trim() !== "", { error: "Expected a non-empty name" })
    .optional(),
  include: globListSchema.optional(),
  exclude: globListSchema.optional(),
  roles: z
    .strictObject(rolesShape, { error: "Expected a mapping of file roles to globs" })
    .optional(),
  analysis: z
    .strictObject(
      {
        max_file_size: z
          .number({ error: "Expected a positive integer (bytes)" })
          .int({ error: "Expected a positive integer (bytes)" })
          .positive({ error: "Expected a positive integer (bytes)" })
          .optional(),
        detail: z.enum(["symbol", "file"]).optional(),
        include_tests_in_metrics: z.boolean().optional(),
        include_type_only: z.boolean().optional(),
        max_provenance_per_edge: z
          .number({ error: "Expected a non-negative integer or null" })
          .int({ error: "Expected a non-negative integer or null" })
          .nonnegative({ error: "Expected a non-negative integer or null" })
          .nullable()
          .optional(),
      },
      { error: "Expected a mapping of analysis options" },
    )
    .optional(),
  languages: z
    .record(
      z.string(),
      z.record(z.string(), z.unknown(), { error: "Expected a mapping of adapter options" }),
      { error: "Expected a mapping of adapter ids to adapter options" },
    )
    .optional(),
  cache: z
    .strictObject(
      {
        enabled: z.boolean().optional(),
        dir: z
          .string({ error: "Expected a directory path" })
          .refine((dir) => dir.trim() !== "", { error: "Expected a non-empty directory path" })
          .optional(),
      },
      { error: "Expected a mapping of cache options" },
    )
    .optional(),
  entry_points: globListSchema.optional(),
} satisfies Record<(typeof CORE_CONFIGURATION_SECTIONS)[number], z.ZodType>;

/** Marks the custom issue reported for unknown top-level keys (its line is the key's line). */
export const UNKNOWN_KEY_ISSUE = "katedrala.unknownKey";

const RESERVED = new Set<string>(RESERVED_CONFIGURATION_SECTIONS);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Levenshtein distance between two strings (UTF-16 code units). */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length] ?? 0;
}

/**
 * The known key most similar to `key` (case-insensitive edit distance of at most a third of the key's length,
 * at most 3), for "did you mean" suggestions; ties are broken by `compareStrings`.
 */
export function suggestKey(key: string, candidates: Iterable<string>): string | undefined {
  const limit = Math.min(3, Math.max(1, Math.floor(key.length / 3)));
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of [...candidates].sort(compareStrings)) {
    const distance = editDistance(key.toLowerCase(), candidate.toLowerCase());
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return bestDistance <= limit ? best : undefined;
}

/** The message for an unknown key, with a suggestion when a known key is similar. */
export function unknownKeyMessage(key: string, known: Iterable<string>, what = "key"): string {
  const suggestion = suggestKey(key, known);
  return suggestion === undefined
    ? `Unknown ${what} "${key}"`
    : `Unknown ${what} "${key}" (did you mean "${suggestion}"?)`;
}

function unknownSectionMessage(key: string, known: ReadonlySet<string>): string {
  if (RESERVED.has(key)) {
    return `Configuration section "${key}" is not supported here: no validator is registered for it`;
  }
  const message = unknownKeyMessage(key, known, "configuration key");
  return `${message}; custom keys must start with "x-"`;
}

/**
 * Compose the configuration schema from the core sections and the sections registered by other packages.
 * Every section is optional; a registered schema validates its section's value when present. Unknown
 * top-level keys are errors unless they start with `x-` (such keys are kept as written).
 *
 * @param extraSections - schemas of additional top-level sections by key (e.g. `rules`).
 * @throws {TypeError} when an extra section redefines a core section.
 */
export function createConfigurationSchema(
  extraSections: Readonly<Record<string, z.ZodType>> = {},
): z.ZodType<KatedralaConfig> {
  const extraShape: Record<string, z.ZodType> = {};
  for (const [name, schema] of Object.entries(extraSections)) {
    if (Object.hasOwn(coreShape, name)) {
      throw new TypeError(`Configuration section "${name}" is defined by @katedrala/core`);
    }
    extraShape[name] = schema.optional();
  }
  const shape = { ...coreShape, ...extraShape };
  const known = new Set(Object.keys(shape));
  const schema = z
    .looseObject(shape, { error: "Expected a mapping of configuration sections" })
    .check(
      z.superRefine(
        (value: Record<string, unknown>, context) => {
          for (const key of Object.keys(value)) {
            if (known.has(key) || key.startsWith("x-")) continue;
            context.addIssue({
              code: "custom",
              path: [key],
              message: unknownSectionMessage(key, known),
              params: { [UNKNOWN_KEY_ISSUE]: true },
            });
          }
        },
        { when: (payload) => isPlainRecord(payload.value) },
      ),
    );
  // Zod infers optional properties as `T | undefined`, which `exactOptionalPropertyTypes` distinguishes from
  // absent properties; validated values never contain explicit `undefined` (zod keeps absent keys absent).
  return schema as unknown as z.ZodType<KatedralaConfig>;
}

/** The known keys of the object schema at `path` inside `schema` (for suggestions); empty when unknown. */
export function knownKeysAt(schema: unknown, path: readonly (string | number)[]): string[] {
  let current = unwrap(schema);
  for (const segment of path) {
    if (current instanceof z.ZodObject) {
      current = unwrap((current.shape as Record<string, unknown>)[String(segment)]);
    } else if (current instanceof z.ZodArray) {
      current = unwrap(current.element);
    } else if (current instanceof z.ZodRecord) {
      current = unwrap(current.valueType);
    } else {
      return [];
    }
  }
  return current instanceof z.ZodObject ? Object.keys(current.shape) : [];
}

function unwrap(schema: unknown): unknown {
  let current = schema;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
    } else if (current instanceof z.ZodDefault) {
      current = current.unwrap();
    } else if (current instanceof z.ZodPipe) {
      current = current.in;
    } else {
      return current;
    }
  }
}
