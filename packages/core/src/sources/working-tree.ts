/**
 * The working-tree snapshot source: files as they are on disk, listed with git when the root is inside a git
 * work tree and by a `.gitignore`-aware walk otherwise.
 */
import type { Stats } from "node:fs";
import { lstat, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  compareStrings,
  normalizePath,
  normalizeRemoteUrl,
  type RevisionInfo,
} from "@katedrala/ir";
import {
  silentLogger,
  type Logger,
  type SnapshotSource,
  type SourceEntry,
} from "@katedrala/plugin-api";
import { mapConcurrent } from "../util/concurrency.js";
import { errorMessage } from "../util/diagnostics.js";
import { isWorkingTreeDirty } from "./dirty.js";
import { SnapshotSourceError, hasExcludedSegment } from "./errors.js";
import { readRegularFile } from "./files.js";
import {
  GITLINK_MODE,
  GitCommandError,
  SYMBOLIC_LINK_MODE,
  isRegularFileMode,
  parseIndexListing,
  runGit,
  type IndexEntry,
} from "./git.js";
import { walkDirectoryTree } from "./walk.js";

/** Concurrent `lstat` calls when checking the paths git lists. */
const FS_CONCURRENCY = 32;

/** `git ls-files` options listing tracked files (with mode, object and flags) and untracked, unignored files. */
const LS_FILES = [
  "ls-files",
  "-z",
  "-v",
  "-s",
  "--cached",
  "--others",
  "--exclude-standard",
] as const;

/** Options of {@link WorkingTreeSource.open}. */
export interface WorkingTreeSourceOptions {
  /**
   * List files with git when the root is inside a git work tree (default `true`). With `false`, outside a
   * work tree, or when the root is a directory its repository ignores, files are found by walking the
   * directory tree honouring every `.gitignore`, and the source has no revision, subdirectory, remote or
   * ancestors.
   */
  useGit?: boolean;
  /** Receives warnings, e.g. about directories that cannot be read (default: silent). */
  logger?: Logger;
}

interface Listing {
  entries: readonly SourceEntry[];
  paths: ReadonlySet<string>;
  skipped: readonly string[];
  /** With git: the index entries under the root, by path relative to it. */
  tracked: ReadonlyMap<string, readonly IndexEntry[]>;
}

/** Whether git ignores the directory `cwd` (`git check-ignore`: exit code 0 when ignored, 1 when not). */
async function isIgnoredDirectory(cwd: string, logger: Logger): Promise<boolean> {
  try {
    await runGit(cwd, ["check-ignore", "-q", "."]);
    return true;
  } catch (error) {
    if (!(error instanceof GitCommandError) || error.exitCode !== 1) {
      logger.debug("Cannot tell whether git ignores the analysis root", {
        error: errorMessage(error),
      });
    }
    return false;
  }
}

/**
 * A {@link SnapshotSource} over a directory on disk (kind `working-tree`). It never modifies the repository
 * and never lets git run a program chosen by the repository's configuration (see `git.ts`).
 *
 * - **With git** (the root is inside a git work tree, is not ignored by it, and `useGit` is not `false`): the
 *   files are those of `git ls-files --cached --others --exclude-standard` run in the root (tracked files
 *   plus untracked files that are not ignored), keeping only regular files that exist. Deleted tracked files
 *   and submodules are dropped. Tracked symbolic links are reported by `skipped()` however git checked them
 *   out (with `core.symlinks=false`, the default of Git for Windows, a link is written as a regular file
 *   holding its target); untracked links, and directory links git listed paths below, are reported too.
 *   Revision, subdirectory, remote and ancestor files come from the repository.
 * - **Without git**: a recursive walk that honours every `.gitignore` (patterns relative to their file's
 *   directory) and never follows symbolic links.
 *
 * In both modes `.git`, `node_modules` and `.katedrala` are excluded at any depth, paths are POSIX and
 * relative to the root, and listings are sorted by UTF-16 code units. `read()` only serves listed paths.
 */
export class WorkingTreeSource implements SnapshotSource {
  /** Always `working-tree`. */
  readonly kind = "working-tree";
  /** Human-readable description for logs (contains the absolute root; never serialized). */
  readonly description: string;
  /** Absolute path of the analysis root. */
  readonly root: string;
  /** Absolute path of the git top level, when files are listed with git. */
  readonly topLevel: string | undefined;
  readonly #logger: Logger;
  #listing: Promise<Listing> | undefined;
  #revision: Promise<RevisionInfo | undefined> | undefined;
  #subdirectory: Promise<string | undefined> | undefined;
  #remote: Promise<string | undefined> | undefined;
  #realPaths: Promise<{ topLevel: string; rootFromTopLevel: string }> | undefined;

  private constructor(root: string, topLevel: string | undefined, logger: Logger) {
    this.root = root;
    this.topLevel = topLevel;
    this.#logger = logger;
    this.description = `working tree at ${root}${topLevel === undefined ? "" : " (git)"}`;
  }

  /**
   * Open a working tree.
   *
   * @param root - absolute path of the analysis root directory.
   * @throws {SnapshotSourceError} `invalid-root` when `root` is not absolute or not a readable directory.
   */
  static async open(
    root: string,
    options: WorkingTreeSourceOptions = {},
  ): Promise<WorkingTreeSource> {
    if (!isAbsolute(root)) {
      throw new SnapshotSourceError(
        "invalid-root",
        `The analysis root must be an absolute path: ${root}`,
        { path: root },
      );
    }
    const absoluteRoot = resolve(root);
    const logger = options.logger ?? silentLogger;
    let isDirectory: boolean;
    try {
      isDirectory = (await stat(absoluteRoot)).isDirectory();
    } catch (error) {
      throw new SnapshotSourceError(
        "invalid-root",
        `Cannot access the analysis root ${absoluteRoot}: ${errorMessage(error)}`,
        { path: root, cause: error },
      );
    }
    if (!isDirectory) {
      throw new SnapshotSourceError(
        "invalid-root",
        `The analysis root is not a directory: ${absoluteRoot}`,
        { path: root },
      );
    }
    let topLevel: string | undefined;
    if (options.useGit !== false) {
      try {
        const output = (await runGit(absoluteRoot, ["rev-parse", "--show-toplevel"])).trim();
        if (output !== "") topLevel = resolve(output);
      } catch {
        topLevel = undefined; // Not a work tree, or git is not installed.
      }
    }
    // A root its repository ignores is not part of that repository: git would list none of its files.
    if (
      topLevel !== undefined &&
      relative(topLevel, absoluteRoot) !== "" &&
      (await isIgnoredDirectory(absoluteRoot, logger))
    ) {
      logger.warn(
        "The analysis root is ignored by its git repository: its files are listed by walking the directory " +
          "tree, without revision metadata",
        { root: absoluteRoot, repository: topLevel },
      );
      topLevel = undefined;
    }
    return new WorkingTreeSource(absoluteRoot, topLevel, logger);
  }

  /** Whether files are listed with git (and revision metadata is available). */
  get usesGit(): boolean {
    return this.topLevel !== undefined;
  }

  /**
   * With git: the `HEAD` commit, its committer date (ISO-8601 UTC) and subject, and whether the tracked files
   * under the root differ from `HEAD` (`dirty`; untracked files do not count). `dirty` is computed without
   * letting git read file content (see `isWorkingTreeDirty`): line-ending-only changes are not differences,
   * and `dirty` is omitted when a changed file could only be compared through a conversion git would apply
   * (a filter driver such as Git LFS, `ident` or `working-tree-encoding`). Undefined without git and on an
   * unborn branch.
   */
  revision(): Promise<RevisionInfo | undefined> {
    this.#revision ??= this.#loadRevision();
    return this.#revision;
  }

  /** With git: the root relative to the top level (`""` at the top level); otherwise undefined. */
  subdirectory(): Promise<string | undefined> {
    this.#subdirectory ??= this.#loadSubdirectory();
    return this.#subdirectory;
  }

  /** With git: the normalized `origin` remote, when configured and usable; otherwise undefined. */
  remote(): Promise<string | undefined> {
    this.#remote ??= this.#loadRemote();
    return this.#remote;
  }

  /** Every listed file, sorted by path. */
  async list(): Promise<readonly SourceEntry[]> {
    return (await this.#getListing()).entries;
  }

  /** Symbolic links and other non-regular files that were not listed, sorted. */
  async skipped(): Promise<readonly string[]> {
    return (await this.#getListing()).skipped;
  }

  /**
   * Raw content of a listed file.
   *
   * @throws {SnapshotSourceError} `unlisted-path` for paths the source does not list, `read-failed` when the
   *   file cannot be read (e.g. it was deleted or replaced by a symbolic link since it was listed).
   */
  async read(path: string): Promise<Uint8Array> {
    const listing = await this.#getListing();
    if (!listing.paths.has(path)) {
      throw new SnapshotSourceError("unlisted-path", `Not a listed file: ${path}`, { path });
    }
    try {
      return await readRegularFile(this.#absolute(this.root, path));
    } catch (error) {
      throw new SnapshotSourceError("read-failed", `Cannot read ${path}: ${errorMessage(error)}`, {
        path,
        cause: error,
      });
    }
  }

  /**
   * With git: the content of a regular file outside the analysis root but inside the top level, by path
   * relative to the top level. Paths are matched exactly, as on a case-sensitive file system, whatever the
   * host: the file must be one git lists at the top level (tracked as a regular file, or untracked and not
   * ignored) under exactly that path, and its real path must be that path (no symbolic link, junction, case
   * variant or other alias on the way). Undefined without git, for paths inside the analysis root (`read()`
   * serves those), for paths that escape the top level, for paths with a `.git`, `node_modules` or
   * `.katedrala` segment (in any case), and for anything else.
   */
  async readAncestor(pathFromTopLevel: string): Promise<Uint8Array | undefined> {
    const topLevel = this.topLevel;
    if (topLevel === undefined) return undefined;
    let path: string;
    try {
      path = normalizePath(pathFromTopLevel);
    } catch {
      return undefined;
    }
    if (path === "" || hasExcludedSegment(path, { ignoreCase: true })) return undefined;
    try {
      const real = await this.#getRealPaths();
      const inside = real.rootFromTopLevel;
      if (inside === "" || path === inside || path.startsWith(`${inside}/`)) return undefined;
      if (!(await this.#isListedAtTopLevel(topLevel, path))) return undefined;
      const absolute = this.#absolute(topLevel, path);
      if (!(await lstat(absolute)).isFile()) return undefined;
      const fromTopLevel = relative(real.topLevel, await realpath(absolute));
      if (isAbsolute(fromTopLevel) || fromTopLevel.split(sep).join("/") !== path) return undefined;
      return await readRegularFile(absolute);
    } catch {
      return undefined;
    }
  }

  /** Nothing to release (git runs as short-lived processes); idempotent. */
  close(): Promise<void> {
    return Promise.resolve();
  }

  #absolute(base: string, path: string): string {
    return join(base, ...path.split("/"));
  }

  /** The real path of the top level, and the real path of the root relative to it (POSIX). */
  #getRealPaths(): Promise<{ topLevel: string; rootFromTopLevel: string }> {
    this.#realPaths ??= (async () => {
      const [topLevel, root] = await Promise.all([
        realpath(this.topLevel ?? this.root),
        realpath(this.root),
      ]);
      return { topLevel, rootFromTopLevel: relative(topLevel, root).split(sep).join("/") };
    })();
    return this.#realPaths;
  }

  /** Whether git lists `path` (relative to the top level) as a regular file or an untracked path. */
  async #isListedAtTopLevel(topLevel: string, path: string): Promise<boolean> {
    const listing = parseIndexListing(
      await runGit(topLevel, [...LS_FILES, "--", `:(literal)${path}`]),
    );
    const entries = listing.tracked.get(path);
    if (entries !== undefined) return entries.every((entry) => isRegularFileMode(entry.mode));
    return listing.untracked.includes(path);
  }

  #getListing(): Promise<Listing> {
    this.#listing ??= this.topLevel === undefined ? this.#listByWalking() : this.#listWithGit();
    return this.#listing;
  }

  async #listByWalking(): Promise<Listing> {
    const { files, skipped } = await walkDirectoryTree(this.root, this.#logger);
    return {
      entries: files,
      paths: new Set(files.map((entry) => entry.path)),
      skipped,
      tracked: new Map(),
    };
  }

  async #listWithGit(): Promise<Listing> {
    const { tracked, untracked } = parseIndexListing(await runGit(this.root, LS_FILES));
    const candidates = [
      ...new Set([
        ...tracked.keys(),
        ...untracked.map((path) => (path.endsWith("/") ? path.slice(0, -1) : path)),
      ]),
    ].filter((path) => path !== "" && !hasExcludedSegment(path));
    // Git may list paths below a directory link (Git for Windows traverses junctions; a tracked directory may
    // have been replaced by a link). Such paths are never followed: the link itself is reported instead.
    const directoryKinds = new Map<string, Promise<"directory" | "link" | "other">>();
    const directoryKind = (directory: string): Promise<"directory" | "link" | "other"> => {
      let kind = directoryKinds.get(directory);
      if (kind === undefined) {
        kind = lstat(this.#absolute(this.root, directory)).then(
          (stats) =>
            stats.isSymbolicLink() ? "link" : stats.isDirectory() ? "directory" : "other",
          () => "other" as const,
        );
        directoryKinds.set(directory, kind);
      }
      return kind;
    };
    const kinds = await mapConcurrent(candidates, FS_CONCURRENCY, async (path) => {
      for (let index = path.indexOf("/"); index !== -1; index = path.indexOf("/", index + 1)) {
        const directory = path.slice(0, index);
        const kind = await directoryKind(directory);
        if (kind === "link") return { kind: "skipped" as const, path: directory };
        if (kind === "other") return undefined;
      }
      const modes = new Set(tracked.get(path)?.map((entry) => entry.mode));
      // Submodules are not files of this snapshot, however they are checked out.
      if (modes.has(GITLINK_MODE)) return undefined;
      let stats: Stats;
      try {
        stats = await lstat(this.#absolute(this.root, path));
      } catch {
        return undefined; // A deleted tracked file.
      }
      // Nested repositories, and tracked paths replaced by a directory, are not files of this snapshot.
      if (stats.isDirectory()) return undefined;
      // A tracked symbolic link is skipped whatever git wrote for it, so that every platform agrees.
      if (modes.has(SYMBOLIC_LINK_MODE)) return { kind: "skipped" as const, path };
      if (stats.isFile()) return { kind: "file" as const, size: stats.size };
      return { kind: "skipped" as const, path };
    });
    const entries: SourceEntry[] = [];
    const skipped = new Set<string>();
    candidates.forEach((path, index) => {
      const kind = kinds[index];
      if (kind?.kind === "file") entries.push({ path, size: kind.size });
      else if (kind?.kind === "skipped") skipped.add(kind.path);
    });
    entries.sort((a, b) => compareStrings(a.path, b.path));
    return {
      entries,
      paths: new Set(entries.map((entry) => entry.path)),
      skipped: [...skipped].sort(compareStrings),
      tracked,
    };
  }

  async #loadRevision(): Promise<RevisionInfo | undefined> {
    if (this.topLevel === undefined) return undefined;
    let commit: string;
    try {
      commit = (await runGit(this.root, ["rev-parse", "--verify", "--quiet", "HEAD"])).trim();
    } catch {
      return undefined; // Unborn branch: no commit yet.
    }
    if (!/^[0-9a-f]{40,64}$/.test(commit)) return undefined;
    const revision: RevisionInfo = { commit };
    try {
      const log = await runGit(this.root, ["log", "-1", "--format=%cI%n%s", commit]);
      const newline = log.indexOf("\n");
      const date = new Date((newline === -1 ? log : log.slice(0, newline)).trim());
      if (!Number.isNaN(date.getTime())) revision.committedAt = date.toISOString();
      const subject = newline === -1 ? "" : log.slice(newline + 1).replace(/\n+$/, "");
      if (subject !== "") revision.subject = subject;
    } catch (error) {
      this.#logger.warn("Cannot read the commit date and subject", { error: errorMessage(error) });
    }
    try {
      const listing = await this.#getListing();
      const dirty = await isWorkingTreeDirty({
        root: this.root,
        commit,
        tracked: listing.tracked,
        listedFiles: listing.paths,
        logger: this.#logger,
      });
      if (dirty !== undefined) revision.dirty = dirty;
    } catch (error) {
      this.#logger.warn("Cannot determine whether the working tree is dirty", {
        error: errorMessage(error),
      });
    }
    return revision;
  }

  async #loadSubdirectory(): Promise<string | undefined> {
    if (this.topLevel === undefined) return undefined;
    try {
      const prefix = await runGit(this.root, ["rev-parse", "--show-prefix"]);
      return normalizePath(prefix.replace(/\n+$/, ""));
    } catch (error) {
      this.#logger.warn("Cannot determine the subdirectory of the analysis root", {
        error: errorMessage(error),
      });
      return undefined;
    }
  }

  async #loadRemote(): Promise<string | undefined> {
    if (this.topLevel === undefined) return undefined;
    try {
      const url = await runGit(this.root, ["config", "--get", "remote.origin.url"]);
      return normalizeRemoteUrl(url.trim());
    } catch {
      return undefined; // No origin remote.
    }
  }
}
