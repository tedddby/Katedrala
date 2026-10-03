/**
 * Listing a directory tree without git: a recursive walk that honours every `.gitignore` file and never
 * follows symbolic links.
 */
import type { Dirent } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import ignore from "ignore";
import { compareStrings } from "@katedrala/ir";
import type { Logger, SourceEntry } from "@katedrala/plugin-api";
import { decodeText } from "../text/text.js";
import { Limiter } from "../util/concurrency.js";
import { errorMessage } from "../util/diagnostics.js";
import { ALWAYS_EXCLUDED_NAMES } from "./errors.js";

/** Concurrent file-system operations while walking. */
const FS_CONCURRENCY = 32;

/** Files and skipped non-regular entries found by {@link walkDirectoryTree}, both sorted by path. */
export interface WalkResult {
  files: SourceEntry[];
  /** Symbolic links and other non-regular files (FIFOs, sockets, devices) that were not listed. */
  skipped: string[];
}

/** The patterns of one `.gitignore` file, which apply to paths relative to the directory containing it. */
interface IgnoreScope {
  base: string;
  matcher: ignore.Ignore;
}

/**
 * Whether git would ignore `path` (POSIX, relative to the walk root): scopes are ordered from the root down,
 * and, as in git, the deepest `.gitignore` with a matching pattern decides (the last matching pattern within
 * one file). Directories are tested with a trailing slash so that `dir/` patterns apply only to them.
 */
function isIgnored(scopes: readonly IgnoreScope[], path: string, isDirectory: boolean): boolean {
  let ignored = false;
  for (const scope of scopes) {
    const relative = scope.base === "" ? path : path.slice(scope.base.length + 1);
    let result: { ignored: boolean; unignored: boolean };
    try {
      result = scope.matcher.test(isDirectory ? `${relative}/` : relative);
    } catch {
      continue;
    }
    if (result.ignored) ignored = true;
    else if (result.unignored) ignored = false;
  }
  return ignored;
}

/**
 * List the regular files below `root` (an absolute directory path) the way git would list untracked files:
 * every `.gitignore` is honoured with patterns relative to its own directory (only regular-file `.gitignore`
 * files are read, as git does), ignored directories are not entered, and `.git`, `node_modules` and
 * `.katedrala` entries are always excluded. Symbolic links (to files or directories) and other non-regular
 * files are never followed; they are reported in `skipped` unless ignored. Subdirectories that cannot be
 * read are reported to the logger and left out.
 *
 * @throws when the root itself cannot be read.
 */
export async function walkDirectoryTree(root: string, logger: Logger): Promise<WalkResult> {
  const limiter = new Limiter(FS_CONCURRENCY);
  const files: SourceEntry[] = [];
  const skipped: string[] = [];
  const absolute = (path: string): string => (path === "" ? root : join(root, ...path.split("/")));
  const child = (directory: string, name: string): string =>
    directory === "" ? name : `${directory}/${name}`;

  const withGitignore = async (
    directory: string,
    entries: readonly Dirent[],
    scopes: readonly IgnoreScope[],
  ): Promise<readonly IgnoreScope[]> => {
    if (!entries.some((entry) => entry.name === ".gitignore" && entry.isFile())) return scopes;
    const path = child(directory, ".gitignore");
    try {
      const decoded = decodeText(await limiter.run(() => readFile(absolute(path))));
      if (decoded.binary) return scopes;
      return [
        ...scopes,
        { base: directory, matcher: ignore({ ignorecase: false }).add(decoded.text) },
      ];
    } catch (error) {
      logger.warn(`Cannot read ${path}; its patterns are not applied`, {
        error: errorMessage(error),
      });
      return scopes;
    }
  };

  const visit = async (directory: string, scopes: readonly IgnoreScope[]): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await limiter.run(() => readdir(absolute(directory), { withFileTypes: true }));
    } catch (error) {
      if (directory === "") throw error;
      logger.warn(`Cannot read directory ${directory}; its files are not listed`, {
        error: errorMessage(error),
      });
      return;
    }
    const scopesHere = await withGitignore(directory, entries, scopes);
    const subdirectories: string[] = [];
    const regularFiles: string[] = [];
    for (const entry of entries) {
      if (ALWAYS_EXCLUDED_NAMES.has(entry.name)) continue;
      const path = child(directory, entry.name);
      const isDirectory = entry.isDirectory();
      if (isIgnored(scopesHere, path, isDirectory)) continue;
      if (isDirectory) subdirectories.push(path);
      else if (entry.isFile()) regularFiles.push(path);
      else skipped.push(path);
    }
    await Promise.all([
      ...regularFiles.map(async (path) => {
        try {
          const stats = await limiter.run(() => lstat(absolute(path)));
          if (stats.isFile()) files.push({ path, size: stats.size });
          else if (!stats.isDirectory()) skipped.push(path);
        } catch {
          // Removed while walking: not part of the snapshot.
        }
      }),
      ...subdirectories.map((path) => visit(path, scopesHere)),
    ]);
  };

  await visit("", []);
  files.sort((a, b) => compareStrings(a.path, b.path));
  skipped.sort(compareStrings);
  return { files, skipped };
}
