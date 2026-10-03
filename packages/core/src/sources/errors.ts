/**
 * Errors raised by the snapshot sources of this package.
 */

/**
 * Stable codes of {@link SnapshotSourceError}:
 * - `invalid-root`: the analysis root is not an absolute path to a directory.
 * - `invalid-path`: a supplied path is empty or escapes the analysis root.
 * - `duplicate-path`: two supplied paths normalize to the same path.
 * - `unlisted-path`: `read()` was called for a path the source does not list.
 * - `read-failed`: a listed file could not be read.
 */
export type SnapshotSourceErrorCode =
  "invalid-root" | "invalid-path" | "duplicate-path" | "unlisted-path" | "read-failed";

/** Error thrown or rejected by the snapshot sources of `@katedrala/core`. */
export class SnapshotSourceError extends Error {
  /** Stable, machine-readable error code. */
  readonly code: SnapshotSourceErrorCode;
  /** The path concerned, when there is one. */
  readonly path?: string;

  constructor(
    code: SnapshotSourceErrorCode,
    message: string,
    options: { path?: string; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "SnapshotSourceError";
    this.code = code;
    if (options.path !== undefined) this.path = options.path;
  }
}

/** Directory names never listed by a working-tree source, at any depth. */
export const ALWAYS_EXCLUDED_NAMES: ReadonlySet<string> = new Set([
  ".git",
  "node_modules",
  ".katedrala",
]);

/**
 * Whether a POSIX path has a segment that is always excluded (`.git`, `node_modules`, `.katedrala`). With
 * `ignoreCase`, segments are compared case-insensitively (`.GIT`, `Node_Modules`), as a case-insensitive file
 * system resolves them.
 */
export function hasExcludedSegment(path: string, options: { ignoreCase?: boolean } = {}): boolean {
  return path
    .split("/")
    .some((segment) =>
      ALWAYS_EXCLUDED_NAMES.has(options.ignoreCase === true ? segment.toLowerCase() : segment),
    );
}
