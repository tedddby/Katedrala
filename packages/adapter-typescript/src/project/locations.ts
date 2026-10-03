/**
 * Locations of project configuration files, which may lie above the analysis root.
 *
 * Paths inside the analysis root are normal IR paths. Configuration can point above the root (a
 * `tsconfig.json` extending `../../tsconfig.base.json` when a subdirectory of a repository is analyzed), so
 * this module uses *loose paths*: normalized POSIX paths relative to the analysis root that may start with
 * `..` segments. When the analysis root's position below the version-control top level is known
 * (`ProjectContext.subdirectory`), loose paths are canonicalized through the top level, so that
 * `../../packages/api/src` analyzed from `packages/api` becomes `src`.
 */
import { joinPath, normalizePath, relativePath } from "@katedrala/ir";

/** Prefix of configuration files read from above the analysis root, in messages and file lists. */
export const TOP_LEVEL_PREFIX = "<top-level>/";

/**
 * Normalize a path relative to the analysis root, keeping leading `..` segments (which climb above the
 * root) instead of rejecting them. Backslashes are separators; empty and `.` segments are dropped.
 *
 * @example normalizeLoose("a/../../b/./c") === "../b/c"
 */
export function normalizeLoose(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split(/[\\/]+/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === ".." && segments.length > 0 && segments[segments.length - 1] !== "..") {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/** Join a loose base directory and a relative path, then normalize (see {@link normalizeLoose}). */
export function joinLoose(base: string, relative: string): string {
  return normalizeLoose(base === "" ? relative : `${base}/${relative}`);
}

/** Whether a normalized loose path lies inside the analysis root (has no leading `..`). */
export function isInsideRoot(loose: string): boolean {
  return loose !== ".." && !loose.startsWith("../");
}

function leadingParentSegments(loose: string): number {
  let count = 0;
  for (const segment of loose.split("/")) {
    if (segment !== "..") break;
    count++;
  }
  return count;
}

/**
 * Converts between root-relative loose paths, version-control top-level paths and the coordinates used to
 * match wildcard patterns.
 */
export class Locator {
  /**
   * @param subdirectory - the analysis root relative to the version-control top level ("" when equal), or
   *   undefined when unknown; paths above the root are unreadable then.
   */
  constructor(readonly subdirectory: string | undefined) {}

  /**
   * The canonical form of a loose path: inside the root when the path leads back into it, otherwise with
   * the fewest leading `..` segments. Undefined when the path climbs above the version-control top level.
   */
  canonical(loose: string): string | undefined {
    const path = normalizeLoose(loose);
    const up = leadingParentSegments(path);
    if (up === 0 || this.subdirectory === undefined) return path;
    const topLevel = this.topLevelPath(path);
    if (topLevel === undefined) return undefined;
    const relative = relativePath(this.subdirectory, topLevel);
    return relative === "." ? "" : relative;
  }

  /** Resolve `relative` against the loose directory `base` and canonicalize the result. */
  resolve(base: string, relative: string): string | undefined {
    return this.canonical(joinLoose(base, relative));
  }

  /**
   * The directories above the analysis root up to the version-control top level, nearest first, as
   * canonical loose paths (`..`, `../..`, ...). Empty when the root is the top level or the top level is
   * unknown.
   */
  ancestorDirectories(): string[] {
    if (this.subdirectory === undefined || this.subdirectory === "") return [];
    const depth = this.subdirectory.split("/").length;
    const directories: string[] = [];
    for (let up = 1; up <= depth; up++) directories.push(Array<string>(up).fill("..").join("/"));
    return directories;
  }

  /**
   * The path relative to the version-control top level; undefined when the top level is unknown or the
   * path climbs above it.
   */
  topLevelPath(loose: string): string | undefined {
    if (this.subdirectory === undefined) return undefined;
    const path = normalizeLoose(loose);
    const up = leadingParentSegments(path);
    const depth = this.subdirectory === "" ? 0 : this.subdirectory.split("/").length;
    if (up > depth) return undefined;
    return normalizePath(joinPath(this.subdirectory, path));
  }

  /**
   * The path in *match coordinates*, used to evaluate wildcard patterns: relative to the top level when it
   * is known, else relative to the analysis root. Undefined for paths that cannot be expressed (above an
   * unknown or exceeded top level).
   */
  matchPath(loose: string): string | undefined {
    if (this.subdirectory === undefined) {
      const path = normalizeLoose(loose);
      return isInsideRoot(path) ? path : undefined;
    }
    return this.topLevelPath(loose);
  }

  /**
   * Convert a path in match coordinates back to a root-relative path; undefined when it lies outside the
   * analysis root.
   */
  rootPathOfMatchPath(matchPath: string): string | undefined {
    if (this.subdirectory === undefined || this.subdirectory === "") return matchPath;
    const root = this.subdirectory;
    if (matchPath === root) return "";
    return matchPath.startsWith(`${root}/`) ? matchPath.slice(root.length + 1) : undefined;
  }

  /**
   * Convert a directory in match coordinates back to a root-relative directory: the directory itself when
   * it lies inside the root, "" when it contains the root, undefined when it is unrelated to the root.
   */
  rootDirectoryOfMatchPath(matchDirectory: string): string | undefined {
    if (this.subdirectory === undefined || this.subdirectory === "") return matchDirectory;
    const root = this.subdirectory;
    if (matchDirectory === root) return "";
    if (matchDirectory.startsWith(`${root}/`)) return matchDirectory.slice(root.length + 1);
    if (matchDirectory === "" || root.startsWith(`${matchDirectory}/`)) return "";
    return undefined;
  }

  /**
   * How a configuration location is shown in messages and in `configurationFiles`: the root-relative path
   * when inside the root, `<top-level>/<path from the top level>` above it.
   */
  display(loose: string): string {
    const path = normalizeLoose(loose);
    if (isInsideRoot(path)) return path;
    const topLevel = this.topLevelPath(path);
    return topLevel === undefined ? path : `${TOP_LEVEL_PREFIX}${topLevel}`;
  }
}
