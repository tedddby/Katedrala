import {
  compareStrings,
  repositoryId,
  sha256Hex,
  type RepositoryId,
  type VcsInfo,
} from "@katedrala/ir";
import type { PackageDescriptor } from "@katedrala/plugin-api";
import { canonicalJson } from "@katedrala/core";

export interface RepositoryIdentityInput {
  /** The name configured in `katedrala.config.yaml`. */
  readonly configuredName?: string;
  /** Packages declared by manifests (all ecosystems). */
  readonly packages: readonly PackageDescriptor[];
  /** The normalized `origin` remote. */
  readonly remote?: string;
  /** Whether the analysis root is inside a version-controlled repository. */
  readonly versionControlled: boolean;
}

export interface RepositoryIdentity {
  readonly id: RepositoryId;
  readonly name: string;
  readonly vcs?: VcsInfo;
}

/**
 * Identify the repository as the IR specifies: the id is `repo:<normalized remote>` when there is a remote,
 * otherwise `repo:<name>`; the display name is the configured name, else the root package's declared name,
 * else the last segment of the remote, else `repository`. Nothing depends on the checkout directory.
 */
export function repositoryIdentity(input: RepositoryIdentityInput): RepositoryIdentity {
  const rootPackage = rootPackageName(input.packages);
  const remoteName = input.remote === undefined ? undefined : lastSegment(input.remote);
  const name = nonEmpty(input.configuredName) ?? rootPackage ?? remoteName ?? "repository";
  const idName = nonEmpty(input.configuredName) ?? rootPackage ?? "repository";
  const vcs: VcsInfo | undefined = input.versionControlled
    ? { type: "git", ...(input.remote === undefined ? {} : { remote: input.remote }) }
    : undefined;
  return {
    id: repositoryId(input.remote ?? idName),
    name,
    ...(vcs === undefined ? {} : { vcs }),
  };
}

/** The declared name of the manifest at the analysis root; the first by ecosystem when several declare one. */
function rootPackageName(packages: readonly PackageDescriptor[]): string | undefined {
  const named = packages
    .filter((pkg) => pkg.path === "" && nonEmpty(pkg.name) !== undefined)
    .sort(
      (a, b) => compareStrings(a.ecosystem, b.ecosystem) || compareStrings(a.manifest, b.manifest),
    );
  return named[0]?.name;
}

function lastSegment(remote: string): string | undefined {
  const segments = remote.split("/").filter((segment) => segment !== "");
  return segments.at(-1);
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === "" ? undefined : trimmed;
}

export interface DigestedFile {
  readonly path: string;
  readonly hash?: string;
  readonly size: number;
}

/**
 * `snapshot.contentDigest`: SHA-256 over `<path>\t<hash or ->\t<size>\n` for every listed file in path order.
 * The files must already be sorted by path (document order).
 */
export function contentDigest(files: readonly DigestedFile[]): string {
  const lines = files.map((file) => `${file.path}\t${file.hash ?? "-"}\t${file.size}\n`);
  return `sha256:${sha256Hex(lines.join(""))}`;
}

/** `snapshot.analysisDigest`: SHA-256 over the canonical JSON of everything besides content that shapes results. */
export function analysisDigest(inputs: unknown): string {
  return `sha256:${sha256Hex(canonicalJson(inputs))}`;
}

/** What an analysis observed besides the content of the document's files. */
export interface OutsideDocumentInputs {
  /** Paths of every file the snapshot lists. */
  readonly listed: readonly string[];
  /** Paths the snapshot did not list because they are links (`SnapshotSource.skipped`). */
  readonly skipped: readonly string[];
  /** The document's files (`FileEntity.path` and `hash`). */
  readonly files: readonly DigestedFile[];
  /**
   * Files of the snapshot read to prepare projects (`package.json`, `tsconfig.json`, ...): path → hash of
   * the normalized text, or undefined when the content was unreadable or binary.
   */
  readonly reads: ReadonlyMap<string, string | undefined>;
  /** Files read above the analysis root: path from the top level → hash, or undefined when absent. */
  readonly ancestorReads: ReadonlyMap<string, string | undefined>;
}

/**
 * The inputs of an analysis that `snapshot.contentDigest` does not cover, because it is computed over the
 * document's files only, as sorted lines:
 * - `listed\t<path>`: a listed file that is not a file of the document (excluded by `include` / `exclude`);
 *   discovery (package roots) and module resolution still see it.
 * - `skipped\t<path>`: a link the source skipped (reported as a diagnostic).
 * - `read\t<path>\t<hash or ->`: a file read to prepare projects whose content the document does not carry
 *   (it is not a file of the document, or it changed after extraction).
 * - `read\t/<path>\t<hash or ->`: a file read (or looked for) above the analysis root.
 *
 * Folded into `snapshot.analysisDigest`, so that documents with equal content and analysis digests are
 * identical even when project configuration lies outside the document's files.
 */
export function outsideDocumentLines(inputs: OutsideDocumentInputs): string[] {
  const hashes = new Map(inputs.files.map((file) => [file.path, file.hash]));
  const lines: string[] = [];
  for (const path of inputs.listed) if (!hashes.has(path)) lines.push(`listed\t${path}`);
  for (const path of inputs.skipped) lines.push(`skipped\t${path}`);
  for (const [path, hash] of inputs.reads) {
    if (hash === undefined || hashes.get(path) !== hash)
      lines.push(`read\t${path}\t${hash ?? "-"}`);
  }
  for (const [path, hash] of inputs.ancestorReads) lines.push(`read\t/${path}\t${hash ?? "-"}`);
  return [...new Set(lines)].sort(compareStrings);
}
