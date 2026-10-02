/**
 * Snapshot sources: read-only views of the files of one snapshot of a repository.
 *
 * The engine never touches the file system or git directly; it reads through a {@link SnapshotSource}.
 * This is what allows the same pipeline to analyze a working tree, a git commit (without checking it out),
 * or an in-memory fixture — and to produce identical documents for identical content regardless of how it
 * was obtained.
 */
import type { RevisionInfo } from "@katedrala/ir";

/** A file listed by a snapshot source. */
export interface SourceEntry {
  /** Path relative to the analysis root, in IR form (POSIX, normalized). */
  readonly path: string;
  /** Size in bytes, as stored. */
  readonly size: number;
  /**
   * Identity of the stored bytes when cheaply known without reading the file (e.g. a git blob id). Equal
   * identities from the same kind of source guarantee equal stored bytes; used only as a cache shortcut.
   */
  readonly objectId?: string;
}

/**
 * Read-only access to the files of one snapshot. Implementations must be deterministic and must behave the
 * same on every platform:
 * - symbolic links are never followed and never listed (each skipped link is reported once by `skipped()`),
 * - files are listed in path order by UTF-16 code units,
 * - paths are matched exactly (case-sensitively).
 */
export interface SnapshotSource {
  readonly kind: "working-tree" | "git-revision" | "in-memory" | `x-${string}`;
  /** Human-readable description for logs and errors (never serialized into documents). */
  readonly description: string;
  /** Revision metadata, when the snapshot belongs to a version-controlled repository. */
  revision(): Promise<RevisionInfo | undefined>;
  /**
   * The analysis root relative to the version-control top level (POSIX, "" when equal), when the snapshot
   * belongs to a version-controlled repository.
   */
  subdirectory(): Promise<string | undefined>;
  /** The normalized `origin` remote (see `normalizeRemoteUrl` in `@katedrala/ir`), when known. */
  remote(): Promise<string | undefined>;
  /** Every file of the snapshot after the source's ignore rules (e.g. .gitignore), sorted by path. */
  list(): Promise<readonly SourceEntry[]>;
  /** Paths that were not listed because they are symbolic links (or other non-regular files), sorted. */
  skipped(): Promise<readonly string[]>;
  /** Raw content of a listed file. Rejects for unlisted paths. */
  read(path: string): Promise<Uint8Array>;
  /**
   * Raw content of a file outside the analysis root but inside the version-control top level, by path
   * relative to the top level; undefined when absent or when the snapshot has no top level.
   */
  readAncestor(pathFromTopLevel: string): Promise<Uint8Array | undefined>;
  /** Release resources (processes, handles). Idempotent. */
  close(): Promise<void>;
}
