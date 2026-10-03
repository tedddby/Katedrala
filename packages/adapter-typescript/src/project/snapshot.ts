/**
 * An index over the file paths of a snapshot: exact (case-sensitive) file and directory lookups and
 * sorted listings, independent of the host file system.
 */
import { compareStrings, parentPath } from "@katedrala/ir";

/** Exact lookups over the files of one snapshot. Paths are normalized IR paths ("" is the root). */
export class SnapshotIndex {
  /** Every file path, sorted by UTF-16 code units and de-duplicated. */
  readonly paths: readonly string[];
  readonly #files: ReadonlySet<string>;
  readonly #directories: ReadonlySet<string>;

  /** @param paths - file paths in any order (the index sorts them). */
  constructor(paths: Iterable<string>) {
    const files = new Set(paths);
    this.paths = Object.freeze([...files].sort(compareStrings));
    this.#files = files;
    const directories = new Set<string>([""]);
    for (const path of this.paths) {
      let directory = parentPath(path);
      while (!directories.has(directory)) {
        directories.add(directory);
        directory = parentPath(directory);
      }
    }
    this.#directories = directories;
  }

  /** Whether `path` is a file of the snapshot (exact, case-sensitive match). */
  hasFile(path: string): boolean {
    return this.#files.has(path);
  }

  /** Whether `path` is a directory containing at least one file; the root ("") always exists. */
  hasDirectory(path: string): boolean {
    return this.#directories.has(path);
  }

  /** Files located below `directory` at any depth, sorted. The root ("") contains every file. */
  filesUnder(directory: string): readonly string[] {
    if (directory === "") return this.paths;
    const prefix = `${directory}/`;
    let low = 0;
    let high = this.paths.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (compareStrings(this.paths[middle] ?? "", prefix) < 0) low = middle + 1;
      else high = middle;
    }
    const result: string[] = [];
    for (let index = low; index < this.paths.length; index++) {
      const path = this.paths[index] ?? "";
      if (!path.startsWith(prefix)) break;
      result.push(path);
    }
    return result;
  }
}
