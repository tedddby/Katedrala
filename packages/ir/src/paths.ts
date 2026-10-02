/**
 * Path utilities implementing the IR path convention: POSIX separators, relative to the analysis root,
 * no leading "./" or "/", no trailing "/", no "." or ".." segments. The root is "".
 *
 * These functions are platform-independent (they never consult the host file system).
 */

/** Error thrown when a path cannot be represented relative to the analysis root. */
export class PathOutsideRootError extends Error {
  constructor(readonly path: string) {
    super(`Path escapes the analysis root: ${JSON.stringify(path)}`);
    this.name = "PathOutsideRootError";
  }
}

/**
 * Normalize a relative path to the IR convention.
 *
 * Backslashes are treated as separators, empty and "." segments are dropped and ".." segments are resolved.
 * Leading separators are ignored (the path is interpreted relative to the root).
 *
 * @throws {PathOutsideRootError} when ".." segments climb above the root.
 */
export function normalizePath(path: string): string {
  const segments: string[] = [];
  for (const segment of path.split(/[\\/]+/)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) throw new PathOutsideRootError(path);
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/** Join path segments and normalize the result. */
export function joinPath(...segments: string[]): string {
  return normalizePath(segments.filter((segment) => segment !== "").join("/"));
}

/** Parent directory of a normalized path; "" for top-level entries and for the root itself. */
export function parentPath(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

/** Last segment of a normalized path; "" for the root. */
export function baseName(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

/**
 * Extension of the last segment including the dot, lower-cased (".ts", ".d.ts" is reported as ".ts").
 * "" when there is none. Dotfiles such as ".gitignore" have no extension.
 */
export function extensionOf(path: string): string {
  const name = baseName(path);
  const index = name.lastIndexOf(".");
  return index <= 0 ? "" : name.slice(index).toLowerCase();
}

/** Whether `path` is `directory` itself or located below it. The root ("") contains every path. */
export function isWithin(path: string, directory: string): boolean {
  if (directory === "") return true;
  return path === directory || path.startsWith(`${directory}/`);
}

/** All ancestor directories of a normalized path, nearest first, ending with the root "". */
export function ancestorsOf(path: string): string[] {
  const ancestors: string[] = [];
  let current = path;
  while (current !== "") {
    current = parentPath(current);
    ancestors.push(current);
  }
  return ancestors;
}

/**
 * Relative path from directory `from` to path `to`, both normalized IR paths, using "../" where needed.
 * Returns "." when they are equal.
 */
export function relativePath(from: string, to: string): string {
  const fromSegments = from === "" ? [] : from.split("/");
  const toSegments = to === "" ? [] : to.split("/");
  let common = 0;
  while (
    common < fromSegments.length &&
    common < toSegments.length &&
    fromSegments[common] === toSegments[common]
  ) {
    common++;
  }
  const ups = fromSegments.slice(common).map(() => "..");
  const rest = toSegments.slice(common);
  const result = [...ups, ...rest].join("/");
  return result === "" ? "." : result;
}
