/**
 * File probing: how a module path without an exact file maps to files of the snapshot (extension
 * substitution and completion, directory index files). Pure functions of the snapshot's file list.
 */
import type { SnapshotIndex } from "./snapshot.js";

/**
 * Extensions appended to a candidate path, in order. As in TypeScript, `.json` is never appended: a JSON
 * module must be named with its extension (see {@link COMMONJS_PROBE_EXTENSIONS} for the exception).
 */
export const PROBE_EXTENSIONS: readonly string[] = Object.freeze([
  ".ts",
  ".tsx",
  ".d.ts",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".d.mts",
  ".d.cts",
  ".mjs",
  ".cjs",
]);

/**
 * Extensions appended for a `require()` call in a JavaScript file: {@link PROBE_EXTENSIONS}, then `.json`,
 * as the Node.js CommonJS loader appends `.json` to a missing file before it tries the directory.
 */
export const COMMONJS_PROBE_EXTENSIONS: readonly string[] = Object.freeze([
  ...PROBE_EXTENSIONS,
  ".json",
]);

/**
 * TypeScript sources that may stand for a missing JavaScript file named in a specifier (ESM imports name
 * the emitted `.js` file: `./a.js` → `a.ts`).
 */
export const TYPESCRIPT_EQUIVALENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  ".js": [".ts", ".tsx", ".d.ts"],
  ".jsx": [".tsx", ".d.ts"],
  ".mjs": [".mts", ".d.mts"],
  ".cjs": [".cts", ".d.cts"],
});

/** The JavaScript extension (`.js`, `.jsx`, `.mjs`, `.cjs`) a path ends with, if any. */
export function javaScriptExtensionOf(path: string): string | undefined {
  const match = /\.(?:js|jsx|mjs|cjs)$/.exec(path);
  return match?.[0];
}

/**
 * Probe a candidate file path: the path itself; for a missing `.js`/`.jsx`/`.mjs`/`.cjs` file its
 * TypeScript equivalents; then the path with each of `extensions` appended. Directories are not
 * considered.
 *
 * @param extensions - extensions to append, in order (default {@link PROBE_EXTENSIONS}).
 */
export function probeFile(
  snapshot: SnapshotIndex,
  candidate: string,
  extensions: readonly string[] = PROBE_EXTENSIONS,
): string | undefined {
  if (candidate === "") return undefined;
  if (snapshot.hasFile(candidate)) return candidate;
  const extension = javaScriptExtensionOf(candidate);
  if (extension !== undefined) {
    const stem = candidate.slice(0, -extension.length);
    for (const replacement of TYPESCRIPT_EQUIVALENTS[extension] ?? []) {
      if (snapshot.hasFile(stem + replacement)) return stem + replacement;
    }
  }
  for (const appended of extensions) {
    if (snapshot.hasFile(candidate + appended)) return candidate + appended;
  }
  return undefined;
}

/**
 * Probe `<directory>/index` with each of `extensions` (default {@link PROBE_EXTENSIONS}).
 */
export function probeIndex(
  snapshot: SnapshotIndex,
  directory: string,
  extensions: readonly string[] = PROBE_EXTENSIONS,
): string | undefined {
  const stem = directory === "" ? "index" : `${directory}/index`;
  for (const appended of extensions) {
    if (snapshot.hasFile(stem + appended)) return stem + appended;
  }
  return undefined;
}
