/**
 * P1 of module inference: prior units (§3.5; docs/ALGORITHMS.md, "Modules", P1), and the working partition
 * that the phases P1–P5 share inside the clustering unit (plan 4.4, "Data").
 *
 * Directories and file names are the strongest available statement of developer intent (§3.2), so module
 * inference starts from a partition of the scope's inference nodes into directory units: below the source
 * root, every directory that is not split becomes one unit with its whole subtree; the source root,
 * containers and oversized directories with sub-directories are split into their loose files and their
 * children. Later phases refine this prior (P2 stems, P4 splits) and override it file by file only on
 * unambiguous evidence (P5).
 *
 * Determinism: units are created in directory path order, nodes are scope-local indices in file id order,
 * and nothing iterates a Map or Set in insertion order.
 */
import { compareStrings, inferredModuleKey, isWithin } from "@katedrala/ir";
import type { FileId, ModuleAnchor } from "@katedrala/ir";
import { DirectoryTree, directoryKind, sourceRoot } from "../directories.js";
import type { InferenceSettings, Scope, UnitKind } from "../types.js";

/**
 * One unit of the working partition [KATEDRALA HEURISTIC] (internal to the clustering unit, plan 4.4). The
 * identity fields are fixed when the unit is created, from its prior (§3.10): files moving in or out never
 * change them.
 */
export interface PartitionUnit {
  /** `inferredModuleKey(anchor)`, without `~inferred` (U4 appends it on a collision). */
  readonly key: string;
  readonly anchor: ModuleAnchor;
  readonly kind: UnitKind;
  /** Whether P5 may move files into the unit (D-35): feature, stem and split units. */
  readonly destination: boolean;
  /** The split directory whose organization formed the unit (P2 stem units). */
  readonly group?: string;
  /** P4: the oversized directory the unit was split from, and its node count before the split. */
  readonly oversized?: { readonly directory: string; readonly nodes: number };
  /** P4 pieces with a fallback key (D-34): the smallest member's file name without its extension. */
  readonly fallbackName?: string;
}

/**
 * The working partition of a scope's nodes [KATEDRALA HEURISTIC] (plan 4.4, "Data"): the units, and the unit
 * of every node (an index into `units`). P1 creates it; P2 and P4 move nodes and add units (members and
 * prior move together); P5 moves nodes only. Units are never removed before P6 drops the empty ones.
 */
export interface Partition {
  readonly units: PartitionUnit[];
  /** Scope node → index into `units`. */
  readonly unitOf: Int32Array;
}

/** What P1 computes for one scope [KATEDRALA HEURISTIC] (§3.5). */
export interface PriorUnits {
  /** The path of every scope node, in node order (file id order). */
  readonly paths: readonly string[];
  /** The directories of the scope's nodes; `directFiles` and `subtreeFiles` return node numbers. */
  readonly tree: DirectoryTree;
  /** §3.5 step 1, over the scope's nodes (D-11). */
  readonly sourceRoot: string;
  /** The directories P1 split, sorted by `compareStrings` (the "path order" of P2, plan 4.8). */
  readonly splitDirectories: readonly string[];
  readonly partition: Partition;
}

/** The kinds of units into which P5 may move files (D-35). */
const DESTINATION_KINDS: ReadonlySet<UnitKind> = new Set<UnitKind>(["feature", "stem", "split"]);

/**
 * Whether a unit of `kind` is a destination of P5 [KATEDRALA HEURISTIC] (§3.9 condition 1, D-35): feature,
 * stem and split units are logical destinations; layer-directory, shared and root units are not. P4
 * remainders keep their unit's kind, so feature-kind remainders are destinations too.
 *
 * Complexity: O(1).
 */
export function isDestinationKind(kind: UnitKind): boolean {
  return DESTINATION_KINDS.has(kind);
}

/**
 * The path of a file identifier (`file:<path>` → `<path>`) [DERIVED]: the inverse of `fileId` for the
 * normalized paths the IR stores.
 *
 * Complexity: O(length). Determinism: a pure function.
 */
export function pathOfFile(file: FileId): string {
  return file.slice("file:".length);
}

/**
 * Add a unit to a partition and return its index [KATEDRALA HEURISTIC]. The key is derived from the anchor
 * with `inferredModuleKey`, which writes the analysis root `.` and escapes `%`, `#` and `~` in the directory
 * part (plan 3.5 item 1, P6 step 1); the destination flag follows the kind (D-35).
 *
 * Complexity: O(length of the anchor directory).
 *
 * @throws {InvalidIdentifierError} (from `@katedrala/ir`) when the anchor's stem is empty or contains `%`,
 *   `#`, `~` or `/`; callers only pass stems that cannot (D-05, D-28, D-34).
 */
export function addUnit(
  partition: Partition,
  anchor: ModuleAnchor,
  kind: UnitKind,
  extra: Pick<PartitionUnit, "group" | "oversized" | "fallbackName"> = {},
): number {
  const unit: PartitionUnit = {
    ...extra,
    key: inferredModuleKey(anchor),
    anchor,
    kind,
    destination: isDestinationKind(kind),
  };
  partition.units.push(unit);
  return partition.units.length - 1;
}

/**
 * The members of every unit, as ascending node arrays indexed like `unitOf`'s units [DERIVED]: a counting
 * sort of `unitOf` (entries outside `[0, unitCount)` are ignored).
 *
 * Complexity: O(n + unitCount). Determinism: members ascending.
 */
export function membersByUnit(unitOf: Int32Array, unitCount: number): Int32Array[] {
  const counts = new Int32Array(unitCount);
  for (let node = 0; node < unitOf.length; node++) {
    const unit = unitOf[node]!;
    if (unit >= 0 && unit < unitCount) counts[unit]!++;
  }
  const members = Array.from({ length: unitCount }, (_, unit) => new Int32Array(counts[unit]!));
  const filled = new Int32Array(unitCount);
  for (let node = 0; node < unitOf.length; node++) {
    const unit = unitOf[node]!;
    if (unit >= 0 && unit < unitCount) members[unit]![filled[unit]!++] = node;
  }
  return members;
}

/**
 * P1, prior units [KATEDRALA HEURISTIC] (§3.5):
 *
 * 1. Build a {@link DirectoryTree} over the scope's node paths and compute the source root `r` (§3.5 step 1,
 *    D-11: over the scope's nodes).
 * 2. Descend from `r`. A directory `d` is split when `d = r`, when `directoryKind(d)` is `container`, or when
 *    its subtree holds more than `maxModuleFiles` nodes while it has a child directory with nodes.
 *    - Not split: one directory unit with every node of the subtree, keyed `d`, of kind `directoryKind(d)`
 *      (`feature`, `layer` or `shared`); only feature units are destinations (D-35).
 *    - Split: the nodes directly in `d` form a unit keyed `d`, of kind `root` when `d = r`, `shared` when `d`
 *      is a container and otherwise `directoryKind(d)` (D-25: a feature directory split only by the size
 *      cap keeps its own kind instead of becoming a pinned shared unit); then its children are descended in
 *      path order.
 * 3. Every unit's prior is its initial member set (the partition's `unitOf`, which P2 and P4 refine and P5
 *    copies before it reassigns).
 *
 * Rationale: features are conventionally the children of the source root or of container directories;
 * deeper directories are a feature's internal structure; the size cap keeps modules at a granularity people
 * can reason about (§3.5). Limitation: the cap is a threshold (a directory growing from 120 to 121 nodes
 * splits into its children).
 *
 * Complexity: O(n · D) time for n nodes and directory depth D (plus sorting each unit's members), O(n)
 * memory. Determinism: a pure function of the scope's node paths and the settings; units are created in
 * depth-first path order and `splitDirectories` is sorted by `compareStrings`.
 *
 * @throws {RangeError} when a node lies outside `scope.directory` (P0 never produces such a scope).
 */
export function priorUnits(scope: Scope, settings: InferenceSettings): PriorUnits {
  const paths = scope.graph.nodes.map(pathOfFile);
  for (const path of paths) {
    if (!isWithin(path, scope.directory)) {
      throw new RangeError(
        `Node ${JSON.stringify(path)} lies outside its scope directory ${JSON.stringify(scope.directory)}`,
      );
    }
  }
  const tree = DirectoryTree.fromPaths(paths);
  const root = sourceRoot(scope.directory, paths);
  const { maxModuleFiles } = settings.modules;
  const { vocabulary } = settings;
  const partition: Partition = { units: [], unitOf: new Int32Array(paths.length).fill(-1) };
  const { unitOf } = partition;
  const splitDirectories: string[] = [];

  // Depth-first in path order; an explicit stack keeps deep directory trees off the call stack.
  const pending: string[] = [root];
  for (let directory = pending.pop(); directory !== undefined; directory = pending.pop()) {
    const kind = directoryKind(directory, vocabulary);
    const children = tree.children(directory);
    const oversized = tree.subtreeSize(directory) > maxModuleFiles && children.length > 0;
    if (directory !== root && kind !== "container" && !oversized) {
      // Not split: one directory unit with the whole subtree.
      const unit = addUnit(partition, { directory }, kind);
      for (const node of tree.subtreeFiles(directory)) unitOf[node] = unit;
      continue;
    }
    splitDirectories.push(directory);
    const direct = tree.directFiles(directory);
    if (direct.length > 0) {
      // D-25: "shared" applies to the loose files of containers only; a directory split by the size cap
      // keeps its own kind.
      const looseKind: UnitKind =
        directory === root ? "root" : kind === "container" ? "shared" : kind;
      const unit = addUnit(partition, { directory }, looseKind);
      for (const node of direct) unitOf[node] = unit;
    }
    for (let index = children.length - 1; index >= 0; index--) pending.push(children[index]!);
  }
  splitDirectories.sort(compareStrings);
  return { paths, tree, sourceRoot: root, splitDirectories, partition };
}
