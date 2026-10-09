/**
 * P6 of module inference: identity (§3.10; docs/ALGORITHMS.md, "Modules", P6): the units that survive,
 * their keys, anchors and names.
 *
 * Identity derives from the **prior**, never from the final membership: keys come from the anchor a unit
 * was created with (P1, P2, P4), and names from its prior members, so files moving in or out of a module
 * (P5) never change its id or its name. Units that P5 emptied are dropped; diff pairs them by member
 * similarity later (M10).
 *
 * Determinism: units are sorted by key with `compareStrings`; every "most frequent" choice breaks ties with
 * `compareStrings`; tokenization and case folding are ASCII-only (D-05).
 */
import { baseName, compareStrings } from "@katedrala/ir";
import type { FileId } from "@katedrala/ir";
import { directoryKind } from "../directories.js";
import { fileStem, nameParts, pluralize, sStem, tokenize } from "../lexical.js";
import type { ClusterUnit, ClusteringContext, FileLabel, Scope } from "../types.js";
import { membersByUnit } from "./prior.js";
import type { PartitionUnit, PriorUnits } from "./prior.js";
import type { Reassignment } from "./reassign.js";
import type { StemUnits } from "./stems.js";

/** The surviving units of a scope and the unit of every node [KATEDRALA HEURISTIC] (P6, §3.10). */
export interface IdentifiedUnits {
  /** Units with at least one final member, sorted by key; keys unique. */
  readonly units: readonly ClusterUnit[];
  /** Scope node → index into `units`. */
  readonly unitOf: Int32Array;
}

/** Layer labels that mark a file as an entity of the model (D-39). */
const ENTITY_LABELS: ReadonlySet<string> = new Set(["domain", "model"]);

/** The role entry that marks a file as an entity of the model (D-39). */
const ENTITY_ROLE = "data-model";

/**
 * The value with the highest count; ties go to the smallest value by `compareStrings`. Undefined for an
 * empty map. Order-independent.
 */
function mostFrequent(counts: ReadonlyMap<string, number>): string | undefined {
  let best: string | undefined;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (
      best === undefined ||
      count > bestCount ||
      (count === bestCount && compareStrings(value, best) < 0)
    ) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** Increment the count of `value`. */
function count(counts: Map<string, number>, value: string): void {
  counts.set(value, (counts.get(value) ?? 0) + 1);
}

/** The name of a directory: its last segment, or the repository name for the analysis root. */
function directoryName(directory: string, repositoryName: string): string {
  return directory === "" ? repositoryName : baseName(directory);
}

/**
 * A package name without its npm scope (`@acme/api` → `api`) [DERIVED] (§3.10, D-38); other names are
 * returned unchanged, and so is a scope without a name after it (`@acme`, `@acme/`).
 *
 * Complexity: O(length). Determinism: a pure function.
 */
export function withoutNpmScope(name: string): string {
  if (!name.startsWith("@")) return name;
  const slash = name.indexOf("/");
  const rest = slash === -1 ? "" : name.slice(slash + 1);
  return rest === "" ? name : rest;
}

/**
 * The name of the root unit of a scope [KATEDRALA HEURISTIC] (§3.10, D-38), the unit of the loose files of
 * the source root `r`:
 *
 * - when `r` is neither a container nor the scope's package directory, the last segment of `r` (the source
 *   root is then a meaningful directory, e.g. `lib`);
 * - otherwise, without a scope package, the repository name;
 * - for an unnamed manifest (the IR names the package after its directory path, or `.` at the root, D-12),
 *   the name of the package directory, or the repository name when the package is at the analysis root;
 * - otherwise the package's declared name without its npm scope (`@acme/api` → `api`).
 *
 * Plan note: for unnamed manifests the plan reads "the last segment of `r`". When `r` is a container below
 * the package directory (`packages/api/src`) that gives `src`, the container name the first rule exists to
 * avoid, so the package directory's name is used instead, as D-12 names unnamed package components. Both
 * readings agree whenever `r` is the package directory.
 *
 * Complexity: O(length of the paths). Determinism: a pure function of its arguments.
 */
export function rootUnitName(
  scope: Scope,
  root: string,
  context: Pick<ClusteringContext, "settings" | "repositoryName">,
): string {
  const { repositoryName } = context;
  const container = root !== "" && directoryKind(root, context.settings.vocabulary) === "container";
  if (!container && root !== scope.directory) return baseName(root);
  const { packageName } = scope;
  if (packageName === undefined) return repositoryName;
  // D-12: an unnamed manifest's package is named after its directory path, or `.` at the analysis root.
  if (packageName === scope.directory || packageName === ".") {
    return directoryName(scope.directory, repositoryName);
  }
  return withoutNpmScope(packageName);
}

/** Whether a file label marks an entity of the model (D-39): label `model` or `domain`, or a data-model role. */
function isEntity(label: FileLabel | undefined): boolean {
  if (label === undefined) return false;
  if (label.label !== null && ENTITY_LABELS.has(label.label)) return true;
  return label.votes.some((vote) => vote.role === ENTITY_ROLE);
}

/**
 * The name of a stem unit [KATEDRALA HEURISTIC] (§3.10, D-39), from its prior members:
 *
 * - **Entity rule.** A member that is an entity of the model (its `FileLabel.label` is `model` or `domain`,
 *   or one of its votes carries the `data-model` role) and whose file-name head is a single token `t` with
 *   `sStem(t.key) = stem` names the module: `pluralize(t.text)` when `t.key = stem` (`models/payment.ts` →
 *   `payments`), else `t.text`, an already plural head (`models/payments.ts` → `payments`). Features named
 *   after entities are conventionally plural collections. When several members qualify, the most frequent
 *   name wins (ties: `compareStrings`).
 * - Otherwise the most frequent original spelling of the stem among the members (ties: `compareStrings`):
 *   the first token of the file name, or the sub-directory name for a sub-directory stem (D-28). Mass nouns
 *   and gerunds (`billing`, `auth`) have no entity file and are not pluralized.
 *
 * The original case is kept (D-39), so `Payment.ts` gives `Payments`. Labels come from the roles stage
 * before layer pruning, so names do not depend on the global layer count (D-39).
 *
 * Complexity: O(Σ name lengths of the members). Determinism: order-independent choices.
 */
export function stemUnitName(
  stem: string,
  members: Int32Array,
  scope: Scope,
  paths: readonly string[],
  originalOf: readonly (string | undefined)[],
  labels: ReadonlyMap<FileId, FileLabel>,
): string {
  const entityNames = new Map<string, number>();
  const originals = new Map<string, number>();
  for (const node of members) {
    const file = scope.graph.nodes[node];
    const path = paths[node];
    if (file === undefined || path === undefined) continue;
    const original = originalOf[node];
    if (original !== undefined) count(originals, original);
    if (!isEntity(labels.get(file))) continue;
    const tokens = tokenize(nameParts(path).head);
    const [token] = tokens;
    if (tokens.length !== 1 || token === undefined || sStem(token.key) !== stem) continue;
    // D-39: a singular head is pluralized; a head that is already plural is kept as written.
    count(entityNames, token.key === stem ? pluralize(token.text) : token.text);
  }
  return mostFrequent(entityNames) ?? mostFrequent(originals) ?? stem;
}

/**
 * The name of a P4 piece [KATEDRALA HEURISTIC] (§3.10): the most frequent original spelling of its stem
 * among its members (ties: `compareStrings`); for a fallback key (D-34), the smallest member's file name
 * without its extension, which P4 recorded.
 *
 * Complexity: O(Σ name lengths of the members). Determinism: order-independent choices.
 */
export function splitPieceName(
  unit: PartitionUnit,
  members: Int32Array,
  paths: readonly string[],
  context: Pick<ClusteringContext, "settings">,
): string {
  if (unit.fallbackName !== undefined) return unit.fallbackName;
  const stem = unit.anchor.stem ?? "";
  const originals = new Map<string, number>();
  for (const node of members) {
    const path = paths[node];
    if (path === undefined) continue;
    const token = fileStem(path, context.settings.vocabulary);
    if (token?.stem === stem) count(originals, token.original);
  }
  return mostFrequent(originals) ?? stem;
}

/** A sorted copy of the ascending members, as the frozen-by-convention typed array of a ClusterUnit. */
function sortedMembers(members: Int32Array | undefined): Int32Array {
  return members === undefined ? new Int32Array(0) : Int32Array.from(members);
}

/**
 * P6, identity [KATEDRALA HEURISTIC] (§3.10):
 *
 * 1. Units without final members are dropped. The others keep the key they were created with:
 *    `inferredModuleKey(anchor)`, which writes the analysis root `.` (also before `#stem`) and escapes `%`,
 *    `#` and `~` in the directory part (plan 3.5 item 1). Keys are unique by construction: one unit per
 *    directory (P1), stems unique per group (P2), piece keys deduplicated against the group's stems (P4,
 *    D-34). `~inferred` is appended by the module stage, which knows the declared names (U4).
 * 2. Names, from the prior members (members after P2 and P4), so that P5 never renames a module:
 *    - feature, layer and shared units, P4 remainders included: the last segment of the anchor directory;
 *    - the root unit: {@link rootUnitName} (D-38);
 *    - stem units: {@link stemUnitName} (D-39);
 *    - P4 pieces: {@link splitPieceName}.
 * 3. Units are sorted by key (`compareStrings`), and every node is mapped to the index of its unit.
 *
 * Complexity: O(n + U log U + Σ name lengths). Determinism: see the module comment.
 *
 * @param prior - P1's result; its partition holds the final assignment after P5.
 * @param stems - P2's result, for the original spellings of stems.
 * @param reassignment - P5's result, for the prior assignment.
 */
export function identifyUnits(
  scope: Scope,
  prior: PriorUnits,
  stems: StemUnits,
  reassignment: Reassignment,
  context: ClusteringContext,
): IdentifiedUnits {
  const { partition, paths, sourceRoot: root } = prior;
  const unitCount = partition.units.length;
  const finalMembers = membersByUnit(partition.unitOf, unitCount);
  const priorMembers = membersByUnit(reassignment.priorOf, unitCount);

  const kept: number[] = [];
  partition.units.forEach((_, index) => {
    if ((finalMembers[index]?.length ?? 0) > 0) kept.push(index);
  });
  kept.sort((a, b) => compareStrings(partition.units[a]?.key ?? "", partition.units[b]?.key ?? ""));

  const newIndex = new Int32Array(unitCount).fill(-1);
  const units: ClusterUnit[] = [];
  for (const index of kept) {
    const unit = partition.units[index];
    if (unit === undefined) continue;
    const members = sortedMembers(finalMembers[index]);
    const priorOfUnit = sortedMembers(priorMembers[index]);
    let name: string;
    switch (unit.kind) {
      case "root":
        name = rootUnitName(scope, root, context);
        break;
      case "stem":
        name = stemUnitName(
          unit.anchor.stem ?? "",
          priorOfUnit,
          scope,
          paths,
          stems.originalOf,
          context.labels,
        );
        break;
      case "split":
        name = splitPieceName(unit, priorOfUnit, paths, context);
        break;
      case "feature":
      case "layer":
      case "shared":
        name = directoryName(unit.anchor.directory, context.repositoryName);
        break;
    }
    newIndex[index] = units.length;
    units.push({
      key: unit.key,
      anchor: unit.anchor,
      kind: unit.kind,
      name,
      members,
      prior: priorOfUnit,
      ...(unit.group === undefined ? {} : { group: unit.group }),
      ...(unit.oversized === undefined ? {} : { oversized: unit.oversized }),
      destination: unit.destination,
    });
  }

  const unitOf = new Int32Array(partition.unitOf.length);
  partition.unitOf.forEach((unit, node) => {
    unitOf[node] = newIndex[unit] ?? -1;
  });
  return { units, unitOf };
}
