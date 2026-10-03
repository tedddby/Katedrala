/**
 * Lookup of the snapshot's packages: by directory, by owning file and by name.
 */
import { ancestorsOf, compareStrings, parentPath } from "@katedrala/ir";
import type { Manifest, ManifestSet } from "./manifests.js";
import type { WorkspaceIndex } from "./workspaces.js";

/** The nearest `package.json` above a file. */
export type NearestManifest =
  | { status: "valid"; manifest: Manifest }
  | { status: "invalid"; path: string }
  | { status: "none" };

function commonSegments(a: string, b: string): number {
  if (a === "" || b === "") return 0;
  const left = a.split("/");
  const right = b.split("/");
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) count++;
  return count;
}

/** Packages of a snapshot, indexed for module resolution. */
export class PackageIndex {
  readonly #byDirectory = new Map<string, Manifest>();
  readonly #byName = new Map<string, Manifest[]>();
  readonly #invalidDirectories: ReadonlySet<string>;
  readonly #workspaces: WorkspaceIndex;

  constructor(manifests: ManifestSet, workspaces: WorkspaceIndex) {
    this.#invalidDirectories = manifests.invalidDirectories;
    this.#workspaces = workspaces;
    for (const manifest of manifests.manifests) {
      this.#byDirectory.set(manifest.directory, manifest);
      if (manifest.name === undefined) continue;
      const list = this.#byName.get(manifest.name) ?? [];
      list.push(manifest);
      this.#byName.set(manifest.name, list);
    }
    for (const list of this.#byName.values()) list.sort((a, b) => compareStrings(a.path, b.path));
  }

  /** The valid manifest located directly in `directory`. */
  manifestAt(directory: string): Manifest | undefined {
    return this.#byDirectory.get(directory);
  }

  /** The nearest `package.json` in the file's directory or above it (valid or not). */
  nearest(file: string): NearestManifest {
    const start = parentPath(file);
    for (const directory of [start, ...ancestorsOf(start)]) {
      const manifest = this.#byDirectory.get(directory);
      if (manifest !== undefined) return { status: "valid", manifest };
      if (this.#invalidDirectories.has(directory)) {
        return {
          status: "invalid",
          path: directory === "" ? "package.json" : `${directory}/package.json`,
        };
      }
    }
    return { status: "none" };
  }

  /** The package owning a file: the nearest valid manifest in its directory or above. */
  owner(file: string): Manifest | undefined {
    const start = parentPath(file);
    for (const directory of [start, ...ancestorsOf(start)]) {
      const manifest = this.#byDirectory.get(directory);
      if (manifest !== undefined) return manifest;
    }
    return undefined;
  }

  /** Whether some manifest declares `name`. */
  hasName(name: string): boolean {
    return this.#byName.has(name);
  }

  /**
   * The package named `name` as seen from `fromFile`. When several manifests declare the name, prefer
   * the package owning the file, then a member of the deepest workspace containing the file, then the
   * package whose directory shares the most leading segments with the file's directory, then path order.
   */
  lookup(name: string, fromFile: string): Manifest | undefined {
    const candidates = this.#byName.get(name);
    if (candidates === undefined || candidates.length <= 1) return candidates?.[0];
    const owner = this.owner(fromFile);
    const fromDirectory = parentPath(fromFile);
    let best: Manifest | undefined;
    let bestKey: readonly number[] = [];
    for (const candidate of candidates) {
      const key = [
        candidate === owner ? 1 : 0,
        this.#workspaces.affinity(candidate.directory, fromDirectory),
        commonSegments(candidate.directory, fromDirectory),
      ];
      if (best === undefined || compareKeys(key, bestKey) > 0) {
        best = candidate;
        bestKey = key;
      }
    }
    return best;
  }
}

function compareKeys(a: readonly number[], b: readonly number[]): number {
  for (let index = 0; index < a.length; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
