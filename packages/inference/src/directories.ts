/**
 * Directory helpers shared by components, roles, modules and layers (§1.4, §2, §3.5; docs/ALGORITHMS.md,
 * "Shared definitions"): the kind of a directory name, a tree of the directories that contain a set of files,
 * the source root of a scope, and the common directory of a set of files.
 *
 * Paths follow the IR convention (`@katedrala/ir` paths): POSIX separators, relative to the analysis root,
 * no trailing `/`; the root is `""`. A file's directory is its `parentPath`.
 *
 * Determinism: directories are listed in `compareStrings` order (sibling paths share their parent's prefix,
 * so this is the order of their names), files by ascending input index. Nothing depends on the order of Map
 * or Set insertion, and directory kinds use ASCII-only case folding (D-05).
 */
import { baseName, compareStrings, parentPath } from "@katedrala/ir";
import { asciiLower, sStem } from "./lexical.js";
import type { DirectoryKind, Vocabulary } from "./types.js";

/**
 * The kind of a directory name [KATEDRALA HEURISTIC] (§1.4): `container`, `layer`, `shared` or `feature`.
 *
 * - D-07: containers match the exact ASCII-lower-cased name (`vocabulary.containers`), never the stemmed
 *   one, so `domains` (a container) does not capture `domain` (a layer) and `libs` does not capture `lib`
 *   (shared);
 * - layer and shared directories match the S-stemmed name (`vocabulary.directoryLayers` keys,
 *   `vocabulary.shared`), so `controllers`, `Services` and `utils` match `controller`, `service`, `util`;
 * - D-08: the precedence is container > layer > shared > feature, so the function is total and deterministic
 *   even when configured vocabularies overlap. Location votes (D-18) and module priors (P1, P2) use it alike.
 *
 * `name` is a directory name; a path is classified by its last segment. The analysis root (`""`) is a
 * feature by this definition; callers treat source roots separately (P1 always splits them).
 *
 * Complexity: O(length of the name). Determinism: ASCII-only case folding (D-05), no locale.
 *
 * @example directoryKind("Controllers", vocabulary) === "layer"
 * @example directoryKind("domains", vocabulary) === "container" // although sStem("domains") is a layer key
 */
export function directoryKind(name: string, vocabulary: Vocabulary): DirectoryKind {
  const segment = baseName(name);
  // D-07: exact (lower-cased, unstemmed) match for containers; D-08: containers take precedence.
  if (vocabulary.containers.has(asciiLower(segment))) return "container";
  const key = sStem(segment);
  if (vocabulary.directoryLayers.has(key)) return "layer";
  if (vocabulary.shared.has(key)) return "shared";
  return "feature";
}

/**
 * The layer a directory name votes for [KATEDRALA HEURISTIC] (§4.3, D-18): the `directoryLayers` entry of its
 * S-stemmed name when {@link directoryKind} is `layer`, else undefined. The kind precedence of D-08 applies,
 * so a container such as `domains/` names no layer although `domain` is a layer key.
 *
 * Complexity: O(length of the name). Determinism: as {@link directoryKind}.
 *
 * @example directoryLayer("repositories", vocabulary) === "repository"
 */
export function directoryLayer(name: string, vocabulary: Vocabulary): string | undefined {
  if (directoryKind(name, vocabulary) !== "layer") return undefined;
  return vocabulary.directoryLayers.get(sStem(baseName(name)));
}

/** One directory of a {@link DirectoryTree} while it is built. */
interface DirectoryNode {
  /** Child directories with files in their subtree; sorted once the tree is built. */
  readonly children: string[];
  /** Indices of the files directly inside, ascending. */
  readonly files: number[];
  /** Files in the subtree. */
  size: number;
}

const NO_DIRECTORIES: readonly string[] = Object.freeze([]);
const NO_FILES: readonly number[] = Object.freeze([]);

/**
 * The directories that contain a set of files [DERIVED]: every ancestor directory of every path, the
 * analysis root (`""`) included, with its child directories, its direct files and the size of its subtree.
 * Directories without files in their subtree do not exist in the tree. Queries about a directory that is
 * not in the tree answer "no children, no files, size 0".
 *
 * Used by components (§2: which directories become components), module priors (P1: descent from the source
 * root, the size cap) and attachment (P7: files directly in a directory).
 *
 * Complexity: built in O(Σ path depth) plus sorting each directory's children; every query is O(1) (the
 * returned arrays are the tree's own frozen arrays). Memory O(files + directories).
 * Determinism: children are sorted by `compareStrings`, files by ascending index; duplicate paths are
 * counted as given (callers pass distinct file paths).
 */
export class DirectoryTree {
  readonly #directories: ReadonlyMap<string, DirectoryNode>;

  private constructor(directories: ReadonlyMap<string, DirectoryNode>) {
    this.#directories = directories;
  }

  /**
   * Build the tree of normalized file paths. File `i` is `paths[i]`; its directory is `parentPath(paths[i])`.
   */
  static fromPaths(paths: readonly string[]): DirectoryTree {
    const directories = new Map<string, DirectoryNode>();
    /** The node of `directory`, created with every missing ancestor and linked to its parent. */
    const nodeOf = (directory: string): DirectoryNode => {
      const existing = directories.get(directory);
      if (existing !== undefined) return existing;
      const node: DirectoryNode = { children: [], files: [], size: 0 };
      directories.set(directory, node);
      if (directory !== "") nodeOf(parentPath(directory)).children.push(directory);
      return node;
    };
    paths.forEach((path, index) => {
      let directory = parentPath(path);
      nodeOf(directory).files.push(index);
      for (;;) {
        const node = directories.get(directory);
        if (node !== undefined) node.size++;
        if (directory === "") break;
        directory = parentPath(directory);
      }
    });
    for (const node of directories.values()) {
      node.children.sort(compareStrings);
      Object.freeze(node.children);
      Object.freeze(node.files);
    }
    return new DirectoryTree(directories);
  }

  /** Whether `directory` contains at least one file in its subtree. */
  has(directory: string): boolean {
    return this.#directories.has(directory);
  }

  /** Child directories of `directory` that have files in their subtree, sorted by `compareStrings`. */
  children(directory: string): readonly string[] {
    return this.#directories.get(directory)?.children ?? NO_DIRECTORIES;
  }

  /** Indices (into the paths the tree was built from) of the files directly in `directory`, ascending. */
  directFiles(directory: string): readonly number[] {
    return this.#directories.get(directory)?.files ?? NO_FILES;
  }

  /** Number of files in the subtree of `directory` (0 when it is not in the tree). */
  subtreeSize(directory: string): number {
    return this.#directories.get(directory)?.size ?? 0;
  }

  /**
   * Indices of every file in the subtree of `directory`, ascending (a new array).
   *
   * Complexity: O(s log s + d) for s files and d directories in the subtree.
   */
  subtreeFiles(directory: string): number[] {
    const files: number[] = [];
    const pending = [directory];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      const node = this.#directories.get(next);
      if (node === undefined) continue;
      // Loops, not spreads: a flat directory may hold more files than a call accepts arguments.
      for (const file of node.files) files.push(file);
      for (const child of node.children) pending.push(child);
    }
    return files.sort((a, b) => a - b);
  }

  /** Every directory of the tree, sorted by `compareStrings` (the root `""` first; a new array). */
  directories(): string[] {
    return [...this.#directories.keys()].sort(compareStrings);
  }
}

/**
 * The source root of a scope [KATEDRALA HEURISTIC] (§3.5 step 1): starting at `scopeDirectory` (a package
 * path, or `""` without a package), descend while the directory contains no file directly and exactly one
 * child directory has files in its subtree (`packages/api` → `packages/api/src`). Paths outside
 * `scopeDirectory` never influence the result.
 *
 * Module inference passes the scope's inference nodes, roles and layers pass every `source` file of the scope
 * (D-11), so that declaring a module never changes another file's location vote.
 *
 * Complexity: O(Σ path depth) (it builds a {@link DirectoryTree}). Determinism: a pure function of its
 * arguments; the order of `filePaths` does not matter.
 */
export function sourceRoot(scopeDirectory: string, filePaths: readonly string[]): string {
  const tree = DirectoryTree.fromPaths(filePaths);
  let directory = scopeDirectory;
  for (;;) {
    const children = tree.children(directory);
    const [only] = children;
    if (tree.directFiles(directory).length > 0 || children.length !== 1 || only === undefined) {
      return directory;
    }
    directory = only;
  }
}

/**
 * The common directory of files [DERIVED]: the deepest directory that contains every path, compared segment
 * by segment (`src/a/x.ts` and `src/ab/y.ts` give `src`, not `src/a`). One path gives its own directory; no
 * path gives the analysis root `""`. Declared modules without `entry` look for their entry points in the
 * common directory of their members (D-43).
 *
 * Complexity: O(Σ path length). Determinism: independent of the order of `paths`.
 *
 * @example commonDirectory(["src/payments/index.ts", "src/payments/stripe/client.ts"]) === "src/payments"
 */
export function commonDirectory(paths: readonly string[]): string {
  let common: string[] | undefined;
  for (const path of paths) {
    const directory = parentPath(path);
    const segments = directory === "" ? [] : directory.split("/");
    if (common === undefined) {
      common = segments;
      continue;
    }
    let shared = 0;
    while (shared < common.length && common[shared] === segments[shared]) shared++;
    common.length = shared;
  }
  return common === undefined ? "" : common.join("/");
}
