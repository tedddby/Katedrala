/**
 * Projection specifications: at which granularity relationships are lifted, which relationship kinds count
 * as dependencies, and which files take part. See {@link Projection} for the lifting rules.
 */
import { EDGE_KINDS, compareStrings } from "@katedrala/ir";
import type { EdgeKind, FileRole, ProjectionInfo } from "@katedrala/ir";
import { ModelError } from "./errors.js";

/**
 * Granularity of a {@link Projection}'s nodes:
 * - `symbol`: symbols, plus files for file-scope code and file-level relationships;
 * - `file`: files;
 * - `component`, `module`, `layer`, `package`: the architectural units of those kinds.
 */
export type ProjectionLevel = "symbol" | "file" | "component" | "module" | "layer" | "package";

/** Every projection level, from the finest to the coarsest. */
export const PROJECTION_LEVELS = [
  "symbol",
  "file",
  "component",
  "module",
  "layer",
  "package",
] as const satisfies readonly ProjectionLevel[];

/**
 * Relationship kinds lifted by default, sorted: every known kind except `depends-on-package`. Manifest
 * declarations are not code dependencies; at the `package` level a caller may opt in by listing the kind
 * explicitly. Plugin (`x-`) kinds are never included by default.
 */
export const DEFAULT_EDGE_KINDS: readonly EdgeKind[] = Object.freeze(
  EDGE_KINDS.filter((kind) => kind !== "depends-on-package").sort(compareStrings),
);

/** File roles whose files take part in a projection by default, sorted: production code and declarations. */
export const DEFAULT_FILE_ROLES: readonly FileRole[] = Object.freeze<FileRole[]>([
  "declaration",
  "source",
]);

/** What a {@link Projection} contains. Omitted options take their documented defaults. */
export interface ProjectionSpec {
  /** Granularity of the nodes. */
  level: ProjectionLevel;
  /** Relationship kinds that are lifted. Default: {@link DEFAULT_EDGE_KINDS}. */
  edgeKinds?: ReadonlySet<EdgeKind>;
  /** Whether type-only relationships (`EdgeEntity.typeOnly`) are lifted. Default `true`. */
  includeTypeOnly?: boolean;
  /**
   * Roles of the files that take part: files with other roles, and their symbols, are not nodes and their
   * relationships are dropped. Default: {@link DEFAULT_FILE_ROLES} (`source`, `declaration`).
   */
  fileRoles?: ReadonlySet<FileRole>;
  /** Whether externals are nodes; when false, relationships with externals are dropped. Default `false`. */
  includeExternals?: boolean;
}

/** The options of a {@link ProjectionSpec} without its level. */
export type ProjectionOptions = Omit<ProjectionSpec, "level">;

/**
 * A {@link ProjectionSpec} with every default applied. Its sets iterate in sorted order and are private
 * copies, so later changes to the caller's sets do not affect it.
 */
export type NormalizedProjectionSpec = Readonly<Required<ProjectionSpec>>;

/** A new set of the distinct values, iterating in canonical (sorted) order. */
function sortedSet<T extends string>(values: Iterable<T>): ReadonlySet<T> {
  return new Set([...values].sort(compareStrings));
}

/** Projection options with their defaults applied. */
function normalizeOptions(options: ProjectionOptions): Readonly<Required<ProjectionOptions>> {
  return {
    edgeKinds: sortedSet(options.edgeKinds ?? DEFAULT_EDGE_KINDS),
    includeTypeOnly: options.includeTypeOnly ?? true,
    fileRoles: sortedSet(options.fileRoles ?? DEFAULT_FILE_ROLES),
    includeExternals: options.includeExternals ?? false,
  };
}

/**
 * Apply the defaults of a projection specification. The result is frozen; its sets iterate in sorted order.
 *
 * @throws {ModelError} `invalid-level` when the level is not one of {@link PROJECTION_LEVELS}.
 */
export function normalizeProjectionSpec(spec: ProjectionSpec): NormalizedProjectionSpec {
  if (!(PROJECTION_LEVELS as readonly string[]).includes(spec.level)) {
    throw new ModelError("invalid-level", `Unknown projection level ${JSON.stringify(spec.level)}`);
  }
  return Object.freeze({ level: spec.level, ...normalizeOptions(spec) });
}

/**
 * A string that identifies a normalized specification: equal specifications have equal keys. Used to
 * memoize projections.
 */
export function projectionKey(spec: NormalizedProjectionSpec): string {
  return JSON.stringify([
    spec.level,
    [...spec.edgeKinds],
    spec.includeTypeOnly,
    [...spec.fileRoles],
    spec.includeExternals,
  ]);
}

/**
 * The IR description (`metrics.projection`) of projection options, with defaults applied and lists sorted.
 * The level and `includeExternals` are not part of the IR description.
 */
export function toProjectionInfo(options: ProjectionOptions): ProjectionInfo {
  const normalized = normalizeOptions(options);
  return {
    edgeKinds: [...normalized.edgeKinds],
    includeTypeOnly: normalized.includeTypeOnly,
    fileRoles: [...normalized.fileRoles],
  };
}

/**
 * The projection options described by an IR `ProjectionInfo` (e.g. a document's `metrics.projection`), so
 * that aggregated dependencies can be computed on the same graph as the metrics. `includeExternals` is left
 * unset, as `ProjectionInfo` does not describe it: projections then exclude externals, like the metrics,
 * while `aggregateDependencies` includes them at the `package` level, where the IR's package dependencies
 * (`PackageEntity.dependencies`) list the externals the package's files use.
 */
export function fromProjectionInfo(info: ProjectionInfo): ProjectionOptions {
  return {
    edgeKinds: new Set(info.edgeKinds),
    includeTypeOnly: info.includeTypeOnly,
    fileRoles: new Set(info.fileRoles),
  };
}
