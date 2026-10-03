/**
 * A snapshot source over files supplied programmatically (tests, editor buffers, API callers).
 */
import {
  PathOutsideRootError,
  compareStrings,
  normalizePath,
  type RevisionInfo,
} from "@katedrala/ir";
import type { SnapshotSource, SourceEntry } from "@katedrala/plugin-api";
import { SnapshotSourceError } from "./errors.js";

/** Content of an in-memory file: text (stored as UTF-8) or raw bytes. */
export type InMemoryContent = string | Uint8Array;

/** Options of {@link InMemorySource}. */
export interface InMemorySourceOptions {
  /** Files by path (normalized to IR form; two paths normalizing to the same path are an error). */
  files: Readonly<Record<string, InMemoryContent>>;
  /** Revision metadata to report. */
  revision?: RevisionInfo;
  /** The analysis root relative to a (virtual) version-control top level. */
  subdirectory?: string;
  /** The normalized `origin` remote to report, returned verbatim (e.g. `github.com/acme/shop`). */
  remote?: string;
  /** Files outside the analysis root, by path relative to the (virtual) top level, for `readAncestor`. */
  ancestors?: Readonly<Record<string, InMemoryContent>>;
  /** Human-readable description (default: `in-memory snapshot (<n> files)`). */
  description?: string;
}

const encoder = new TextEncoder();

function toBytes(content: InMemoryContent): Uint8Array {
  return typeof content === "string" ? encoder.encode(content) : Uint8Array.from(content);
}

function normalizeFiles(
  files: Readonly<Record<string, InMemoryContent>>,
  what: string,
): Map<string, Uint8Array> {
  const result = new Map<string, Uint8Array>();
  for (const [rawPath, content] of Object.entries(files)) {
    let path: string;
    try {
      path = normalizePath(rawPath);
    } catch (error) {
      if (!(error instanceof PathOutsideRootError)) throw error;
      throw new SnapshotSourceError("invalid-path", `${what} path escapes the root: ${rawPath}`, {
        path: rawPath,
        cause: error,
      });
    }
    if (path === "") {
      throw new SnapshotSourceError(
        "invalid-path",
        `${what} path is empty: ${JSON.stringify(rawPath)}`,
        {
          path: rawPath,
        },
      );
    }
    if (result.has(path)) {
      throw new SnapshotSourceError("duplicate-path", `${what} path given twice: ${path}`, {
        path,
      });
    }
    result.set(path, toBytes(content));
  }
  // As in any file system or git tree, a path cannot be both a file and a directory.
  for (const path of result.keys()) {
    for (let index = path.indexOf("/"); index !== -1; index = path.indexOf("/", index + 1)) {
      const directory = path.slice(0, index);
      if (result.has(directory)) {
        throw new SnapshotSourceError(
          "invalid-path",
          `${what} path ${directory} is also the directory of ${path}`,
          { path: directory },
        );
      }
    }
  }
  return result;
}

function normalizeSubdirectory(subdirectory: string): string {
  try {
    return normalizePath(subdirectory);
  } catch (error) {
    throw new SnapshotSourceError(
      "invalid-path",
      `Subdirectory escapes the root: ${subdirectory}`,
      {
        path: subdirectory,
        cause: error,
      },
    );
  }
}

/**
 * A {@link SnapshotSource} over in-memory files (kind `in-memory`). Paths are normalized to IR form when the
 * source is created; `list()` returns them sorted by UTF-16 code units; `read()` returns a copy of the stored
 * bytes and rejects with a {@link SnapshotSourceError} (`unlisted-path`) for any other path. There are no
 * symbolic links, so `skipped()` is always empty. Strings are stored as UTF-8.
 */
export class InMemorySource implements SnapshotSource {
  /** Always `in-memory`. */
  readonly kind = "in-memory";
  /** Human-readable description for logs. */
  readonly description: string;
  readonly #files: Map<string, Uint8Array>;
  readonly #ancestors: Map<string, Uint8Array>;
  readonly #entries: readonly SourceEntry[];
  readonly #revision: RevisionInfo | undefined;
  readonly #subdirectory: string | undefined;
  readonly #remote: string | undefined;

  /**
   * @throws {SnapshotSourceError} `invalid-path` for empty or escaping paths and for a path that is also the
   *   directory of another path, `duplicate-path` when two paths normalize to the same path.
   */
  constructor(options: InMemorySourceOptions) {
    this.#files = normalizeFiles(options.files, "File");
    this.#ancestors = normalizeFiles(options.ancestors ?? {}, "Ancestor file");
    this.#entries = Object.freeze(
      [...this.#files.keys()]
        .sort(compareStrings)
        .map((path): SourceEntry => ({ path, size: this.#files.get(path)?.byteLength ?? 0 })),
    );
    this.#revision = options.revision === undefined ? undefined : { ...options.revision };
    this.#subdirectory =
      options.subdirectory === undefined ? undefined : normalizeSubdirectory(options.subdirectory);
    this.#remote = options.remote;
    this.description = options.description ?? `in-memory snapshot (${this.#files.size} files)`;
  }

  /** The revision given at construction (a copy), if any. */
  revision(): Promise<RevisionInfo | undefined> {
    return Promise.resolve(this.#revision === undefined ? undefined : { ...this.#revision });
  }

  /** The subdirectory given at construction (normalized), if any. */
  subdirectory(): Promise<string | undefined> {
    return Promise.resolve(this.#subdirectory);
  }

  /** The remote given at construction, verbatim, if any. */
  remote(): Promise<string | undefined> {
    return Promise.resolve(this.#remote);
  }

  /** Every file, sorted by path. */
  list(): Promise<readonly SourceEntry[]> {
    return Promise.resolve(this.#entries);
  }

  /** Always empty: in-memory snapshots have no symbolic links. */
  skipped(): Promise<readonly string[]> {
    return Promise.resolve([]);
  }

  /** A copy of a listed file's bytes; rejects with `unlisted-path` for any other path. */
  read(path: string): Promise<Uint8Array> {
    const bytes = this.#files.get(path);
    if (bytes === undefined) {
      return Promise.reject(
        new SnapshotSourceError("unlisted-path", `Not a listed file: ${path}`, { path }),
      );
    }
    return Promise.resolve(Uint8Array.from(bytes));
  }

  /**
   * A copy of an ancestor file's bytes (by path relative to the top level), or undefined. As for every
   * source, paths inside the analysis root (the `subdirectory`, when one is given) are not ancestors: they
   * are undefined even when `ancestors` has them.
   */
  readAncestor(pathFromTopLevel: string): Promise<Uint8Array | undefined> {
    let path: string;
    try {
      path = normalizePath(pathFromTopLevel);
    } catch {
      return Promise.resolve(undefined);
    }
    const inside = this.#subdirectory;
    if (
      inside !== undefined &&
      (inside === "" || path === inside || path.startsWith(`${inside}/`))
    ) {
      return Promise.resolve(undefined);
    }
    const bytes = this.#ancestors.get(path);
    return Promise.resolve(bytes === undefined ? undefined : Uint8Array.from(bytes));
  }

  /** Nothing to release. */
  close(): Promise<void> {
    return Promise.resolve();
  }
}
