/**
 * Whether the tracked files of a working tree differ from a commit, decided without letting git read
 * working-tree content.
 *
 * `git status` would re-hash every file whose cached stat data is stale through the clean or process filter
 * that `.gitattributes` selects, which runs a command the repository's configuration chooses (see `git.ts`).
 * Instead, the index is compared with the commit's tree (`git ls-files` and `git ls-tree` only read the index
 * and the object database), and each tracked file is hashed in-process as a git blob and compared with the
 * object id the index records for it.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { Logger } from "@katedrala/plugin-api";
import { mapConcurrent } from "../util/concurrency.js";
import { errorMessage } from "../util/diagnostics.js";
import { hasExcludedSegment } from "./errors.js";
import { openRegularFile } from "./files.js";
import {
  isRegularFileMode,
  parseAttributes,
  parseObjectSizes,
  parseTree,
  runGit,
  type IndexEntry,
  type TreeEntry,
} from "./git.js";

/** Files hashed concurrently. */
const FS_CONCURRENCY = 16;

/** Bytes read at a time while hashing a file. */
const READ_CHUNK_SIZE = 64 * 1024;

const CR = 0x0d;
const LF = 0x0a;
const CR_ONLY = Uint8Array.of(CR);

/**
 * Attributes under which git converts content in ways that cannot be reproduced without running git (a
 * filter driver, `$Id$` expansion, re-encoding): a file under one of them whose bytes do not match its blob
 * may still be unchanged.
 */
const UNVERIFIABLE_ATTRIBUTES = ["filter", "ident", "working-tree-encoding"] as const;

/** Errors meaning that a listed file is no longer a regular file at its path. */
const GONE_ERRORS: ReadonlySet<string> = new Set(["ENOENT", "ENOTDIR", "ELOOP", "EISDIR"]);

/** What {@link isWorkingTreeDirty} compares. */
export interface DirtyCheckInput {
  /** Absolute path of the analysis root, inside a git work tree; git runs there. */
  readonly root: string;
  /** The commit to compare with (normally `HEAD`). */
  readonly commit: string;
  /** Index entries under the root by path relative to it (see `parseIndexListing`). */
  readonly tracked: ReadonlyMap<string, readonly IndexEntry[]>;
  /** Paths the working tree holds as regular files (the source's listing). */
  readonly listedFiles: ReadonlySet<string>;
  readonly logger: Logger;
}

/**
 * Remove the CR of every CRLF pair from a chunk, given whether the previous chunk ended with a CR (held back
 * until the next byte is known). Returns the parts to hash and whether this chunk ends with a CR.
 */
function convertLineEndings(
  chunk: Uint8Array,
  pendingCR: boolean,
): { parts: Uint8Array[]; pendingCR: boolean } {
  const parts: Uint8Array[] = [];
  if (pendingCR && chunk[0] !== LF) parts.push(CR_ONLY);
  let start = 0;
  for (let index = chunk.indexOf(CR); index !== -1; index = chunk.indexOf(CR, index + 1)) {
    if (index === chunk.length - 1) {
      parts.push(chunk.subarray(start, index));
      return { parts, pendingCR: true };
    }
    if (chunk[index + 1] === LF) {
      parts.push(chunk.subarray(start, index));
      start = index + 1;
    }
  }
  parts.push(chunk.subarray(start));
  return { parts, pendingCR: false };
}

/**
 * Whether a file holds the content of the git blob `objectId` of `size` bytes (SHA-1 or SHA-256, by the id's
 * length): its bytes, or its bytes with every CRLF converted to LF (what git does on commit under
 * `core.autocrlf` or the `text` and `eol` attributes), hash to `objectId` as a git blob. A file shorter than
 * the blob cannot match and is not read; reading stops as soon as the content exceeds the blob.
 *
 * @throws when the file cannot be opened or read.
 */
export async function fileMatchesBlob(
  path: string,
  objectId: string,
  size: number,
): Promise<boolean> {
  const handle = await openRegularFile(path);
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || stats.size < size) return false;
    // With equal sizes only the bytes as they are can match: converting a CRLF would shorten them.
    const convert = stats.size > size;
    const hash = createHash(objectId.length === 64 ? "sha256" : "sha1");
    hash.update(`blob ${size}\0`);
    let hashed = 0;
    const add = (part: Uint8Array): boolean => {
      hashed += part.length;
      if (hashed > size) return false;
      hash.update(part);
      return true;
    };
    const buffer = new Uint8Array(READ_CHUNK_SIZE);
    let pendingCR = false;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      if (!convert) {
        if (!add(chunk)) return false;
        continue;
      }
      const converted = convertLineEndings(chunk, pendingCR);
      pendingCR = converted.pendingCR;
      if (!converted.parts.every(add)) return false;
    }
    if (pendingCR && !add(CR_ONLY)) return false;
    return hashed === size && hash.digest("hex") === objectId;
  } finally {
    await handle.close();
  }
}

/** The blobs of regular files by path, leaving out paths with an always-excluded segment (as listings do). */
function regularFileBlobs(tree: ReadonlyMap<string, TreeEntry>): Map<string, string> {
  const files = new Map<string, string>();
  for (const [path, entry] of tree) {
    if (entry.type === "blob" && isRegularFileMode(entry.mode) && !hasExcludedSegment(path)) {
      files.set(path, entry.objectId);
    }
  }
  return files;
}

type Comparison = "same" | "different" | "unverifiable";

/**
 * Whether the tracked regular files under the root differ from `commit`; `undefined` when that cannot be
 * decided without a conversion only git can apply, or when git fails.
 *
 * Among regular files outside `.git`, `node_modules` and `.katedrala`, the answer is `true` when:
 * - the index differs from the commit (a file added, removed or changed in the index, or a path unmerged);
 * - a tracked file is missing from the working tree, is no longer a regular file or lies below a symbolic
 *   link (it is not listed);
 * - a tracked file's content is not the blob the index records, neither as it is nor with its CRLF line
 *   endings converted to LF, and no `filter`, `ident` or `working-tree-encoding` attribute applies to it.
 *
 * When every mismatching file is under such an attribute (e.g. Git LFS files, whose blob is a pointer), the
 * answer is `undefined`: only running the conversion could tell. Line-ending-only changes are not differences
 * (they do not change what Katedrala analyzes), and neither are file modes, symbolic links, submodules,
 * untracked files, files outside the sparse checkout (`skip-worktree`) and files marked `assume-unchanged`
 * (git does not look at those either).
 */
export async function isWorkingTreeDirty(input: DirtyCheckInput): Promise<boolean | undefined> {
  const { root, commit, tracked, listedFiles, logger } = input;
  const index = new Map<string, IndexEntry>();
  for (const [path, entries] of tracked) {
    if (hasExcludedSegment(path)) continue;
    for (const entry of entries) {
      if (!isRegularFileMode(entry.mode)) continue;
      if (entry.stage !== 0) return true; // An unmerged path.
      index.set(path, entry);
    }
  }

  let head: Map<string, string>;
  try {
    head = regularFileBlobs(parseTree(await runGit(root, ["ls-tree", "-r", "-z", commit])));
  } catch (error) {
    logger.warn("Cannot list the files of the commit", { error: errorMessage(error) });
    return undefined;
  }
  if (head.size !== index.size) return true;
  for (const [path, entry] of index) {
    if (head.get(path) !== entry.objectId) return true;
  }

  const toCompare: Array<{ path: string; objectId: string }> = [];
  for (const [path, entry] of index) {
    if (entry.skipWorktree || entry.assumeUnchanged) continue;
    if (!listedFiles.has(path)) return true; // Deleted, replaced by something else, or below a link.
    toCompare.push({ path, objectId: entry.objectId });
  }
  if (toCompare.length === 0) return false;

  let sizes: Map<string, number>;
  try {
    const objects = [...new Set(toCompare.map((file) => file.objectId))];
    const output = await runGit(root, ["cat-file", "--batch-check=%(objectname) %(objectsize)"], {
      input: `${objects.join("\n")}\n`,
    });
    sizes = parseObjectSizes(output);
  } catch (error) {
    logger.warn("Cannot read the sizes of tracked files", { error: errorMessage(error) });
    return undefined;
  }

  const comparisons = await mapConcurrent(
    toCompare,
    FS_CONCURRENCY,
    async ({ path, objectId }): Promise<Comparison> => {
      const size = sizes.get(objectId);
      if (size === undefined) return "unverifiable"; // A blob missing from a partial clone.
      try {
        const matches = await fileMatchesBlob(join(root, ...path.split("/")), objectId, size);
        return matches ? "same" : "different";
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code ?? "";
        return GONE_ERRORS.has(code) ? "different" : "unverifiable";
      }
    },
  );
  const mismatches = toCompare
    .filter((_, position) => comparisons[position] === "different")
    .map((file) => file.path);
  let unverifiable = comparisons.includes("unverifiable");

  if (mismatches.length > 0) {
    let attributes: Map<string, Map<string, string>>;
    try {
      const output = await runGit(
        root,
        ["check-attr", "-z", "--stdin", ...UNVERIFIABLE_ATTRIBUTES],
        { input: `${mismatches.join("\0")}\0` },
      );
      attributes = parseAttributes(output);
    } catch (error) {
      logger.warn("Cannot read the attributes of changed files", { error: errorMessage(error) });
      return undefined;
    }
    if (mismatches.some((path) => (attributes.get(path)?.size ?? 0) === 0)) return true;
    unverifiable = true;
  }
  if (unverifiable) {
    logger.debug(
      "Whether the working tree differs from the commit is unknown: some files could only be compared " +
        "through git's own conversions (filter, ident or working-tree-encoding attributes) or have no blob",
    );
    return undefined;
  }
  return false;
}
