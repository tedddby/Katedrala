/**
 * P3 of module inference: structural classes on the prior (§3.7; docs/ALGORITHMS.md, "Modules", P3).
 *
 * Three kinds of files would distort a dependency-based reassignment: utilities used everywhere (Bunch's
 * *omnipresent* modules, Mancoridis et al. 1999) would glue all modules together, composition roots that
 * import every feature would pull features together, and barrels front the directory they live in. P3
 * classifies them on the prior partition (after P2); P4 leaves orchestrators and utilities out of its
 * Louvain graph, P5 pins all three and does not count the edges of orchestrators and utilities as evidence.
 * Files of shared units are pinned too: putting a file into `shared/` is an explicit statement of intent.
 *
 * The classes are heuristics, and on linker graphs they are broader than the design prototype's (package
 * barrels and feature files qualify, plan 4.4 P3), so the triggers are recorded for the evidence wording of
 * D-66: which orchestrator rule fired, how many units a composition root's dependencies reach, and how many
 * units a utility's dependents lie in.
 *
 * "Dependents" and "dependencies" are a node's in-scope neighbours through arcs of weight > 0 (D-29).
 *
 * Determinism: every count and sum runs over typed arrays in CSR order; the orchestrator set is the unique
 * least fixpoint of monotone conditions (D-30), so it does not depend on the order in which the worklist
 * visits nodes; sums are exact (D-67).
 */
import type { FileId } from "@katedrala/ir";
import type { InferenceSettings, Scope, StructuralClasses } from "../types.js";
import type { Partition } from "./prior.js";

/**
 * The utility threshold for files of shared and root units [KATEDRALA HEURISTIC] (§3.7, D-31): their
 * dependents must lie in at least this many other prior units. A fixed constant (§6.3), unlike
 * `utility_min_modules` for other units; docs/ALGORITHMS.md documents it.
 */
export const SHARED_UTILITY_MIN_MODULES = 2;

/**
 * Orchestrator condition (iii) [KATEDRALA HEURISTIC] (§3.7, D-31): no unit receives more than this share of
 * the out-weight. Compared on exact sums (`largest ≤ 0.5 · total`, D-67).
 */
export const ORCHESTRATOR_MAX_UNIT_SHARE = 0.5;

/**
 * Orchestrator condition (iv) [KATEDRALA HEURISTIC] (§3.7, D-31): the file's own unit receives at most this
 * share of the out-weight. Compared on exact sums (`own ≤ 0.25 · total`, D-67).
 */
export const ORCHESTRATOR_MAX_OWN_SHARE = 0.25;

/** `StructuralClasses.orchestratorRule` [KATEDRALA HEURISTIC] (D-66): no orchestrator. */
export const NO_RULE = 0;
/**
 * `StructuralClasses.orchestratorRule` [KATEDRALA HEURISTIC] (§3.7, D-31, D-66): the entry-point rule, a
 * declared entry point without non-orchestrator dependents.
 */
export const ENTRY_POINT_RULE = 1;
/**
 * `StructuralClasses.orchestratorRule` [KATEDRALA HEURISTIC] (§3.7, D-66): the shape rule, conditions
 * (i)–(iv).
 */
export const SHAPE_RULE = 2;

/** The classes of P3, plus the masks the later phases read [KATEDRALA HEURISTIC] (§3.7). */
export interface ClassifiedNodes {
  readonly classes: StructuralClasses;
  /** First-pass utilities (all dependents counted); the shape rule ignores them as dependencies. */
  readonly firstPassUtilities: Uint8Array;
  /**
   * Pinned nodes (P5 never moves them): orchestrators, utilities, facades and members of units whose prior
   * kind is shared (D-35).
   */
  readonly pinned: Uint8Array;
  /** Nodes whose arcs are no evidence (P4, P5): orchestrators and utilities. */
  readonly excluded: Uint8Array;
}

/**
 * The number of distinct units other than `unitOf[node]` among the dependents of `node` that are not
 * `ignored`, with a per-unit marker stamped with the node, so each call is O(in-degree).
 */
function dependentUnitCount(
  scope: Scope,
  unitOf: Int32Array,
  marker: Int32Array,
  node: number,
  ignored: Uint8Array | undefined,
): number {
  const { graph } = scope.graph;
  const own = unitOf[node]!;
  let count = 0;
  for (let e = graph.inOffsets[node]!; e < graph.inOffsets[node + 1]!; e++) {
    const source = graph.inSources[e]!;
    if (ignored !== undefined && ignored[source] === 1) continue;
    const unit = unitOf[source]!;
    if (unit === own || marker[unit] === node) continue;
    marker[unit] = node;
    count++;
  }
  return count;
}

/**
 * P3, structural classes on the prior partition (the partition after P2) [KATEDRALA HEURISTIC] (§3.7):
 *
 * 1. **First-pass utilities.** A node is a utility when its dependents lie in at least `utilityMinModules`
 *    prior units other than its own, or in at least {@link SHARED_UTILITY_MIN_MODULES} when its own unit is
 *    a shared or root unit (D-31).
 * 2. **Orchestrators** (composition roots), as a monotone worklist fixpoint (D-30). A node that is not a
 *    first-pass utility becomes an orchestrator by
 *    - the *entry-point rule*: it is a declared entry point (D-31) and none of its dependents is a
 *      non-orchestrator; or
 *    - the *shape rule*: (i) none of its non-orchestrator dependents lies outside its prior unit, and its
 *      out-weights to units, first-pass utilities ignored, (ii) reach at least 2 other units, (iii) give no
 *      unit more than {@link ORCHESTRATOR_MAX_UNIT_SHARE} of the total and (iv) give its own unit at most
 *      {@link ORCHESTRATOR_MAX_OWN_SHARE}; (ii)–(iv) are fixed per node and compared on exact sums (D-67).
 *
 *    Counters of non-orchestrator dependents (all, and outside the prior unit) are decremented when a node
 *    becomes an orchestrator, and its dependencies are re-examined. Both rules only get easier as the set
 *    grows, so the least fixpoint is unique: it equals the prototype's repeated id-order passes (D-30) in
 *    O(n + m) instead of O(n · (n + m)). `orchestratorRule` is read at the fixpoint, where it is
 *    order-independent: the entry-point rule when it holds there (it takes precedence, as in the
 *    prototype's check order), else the shape rule. `dependencyUnits` is the count of (ii) for every node.
 *    Plan note: plan 4.4 P3 records "which rule fired first", but that depends on the evaluation order,
 *    which the worklist changes (a node can meet the shape rule first in the worklist and the entry-point
 *    rule first in the prototype's passes), so the recorded rule is the one that holds at the fixpoint.
 *    A rule that fires in any order still holds there (both only get easier as the set grows), and the
 *    recorded rule's conditions hold for the final classes, so the evidence states a true rule (D-66).
 * 3. **Final utilities.** Recount as in step 1 with orchestrators ignored as dependents; orchestrators are
 *    never utilities. `dependentUnits` is the count for every node (D-66).
 * 4. **Facades** (barrels): `reexportOutDegree · 2 ≥ admittedOutDegree > 0`, on the admitted degrees of D-04
 *    (a type-only barrel stays a facade when `type_only_weight = 0`).
 * 5. **Pinned** nodes: orchestrators, utilities, facades and the members of shared units (D-35).
 *
 * Complexity: O(n + m + U) time and memory. Determinism: see the module comment.
 *
 * @param entryPoints - files of `document.entryPoints`, a file entity or a symbol's file (D-31).
 */
export function structuralClasses(
  scope: Scope,
  partition: Partition,
  settings: InferenceSettings,
  entryPoints: ReadonlySet<FileId>,
): ClassifiedNodes {
  const { graph, nodes, admittedOutDegree, reexportOutDegree } = scope.graph;
  const { units, unitOf } = partition;
  const n = graph.nodeCount;
  const unitCount = units.length;
  const lowThreshold = new Uint8Array(unitCount);
  units.forEach((unit, index) => {
    lowThreshold[index] = unit.kind === "shared" || unit.kind === "root" ? 1 : 0;
  });
  const thresholdOf = (node: number): number =>
    lowThreshold[unitOf[node]!] === 1
      ? SHARED_UTILITY_MIN_MODULES
      : settings.modules.utilityMinModules;
  const marker = new Int32Array(unitCount).fill(-1);

  // 1. First-pass utilities: every dependent counts.
  const firstPassUtilities = new Uint8Array(n);
  for (let node = 0; node < n; node++) {
    const count = dependentUnitCount(scope, unitOf, marker, node, undefined);
    firstPassUtilities[node] = count >= thresholdOf(node) ? 1 : 0;
  }

  // 2a. The fixed part of the shape rule, conditions (ii)–(iv).
  const shape = new Uint8Array(n);
  const dependencyUnits = new Int32Array(n);
  const weight = new Float64Array(unitCount);
  const stamp = new Int32Array(unitCount).fill(-1);
  const touched: number[] = [];
  for (let node = 0; node < n; node++) {
    const own = unitOf[node]!;
    touched.length = 0;
    let total = 0;
    for (let e = graph.outOffsets[node]!; e < graph.outOffsets[node + 1]!; e++) {
      const target = graph.outTargets[e]!;
      if (firstPassUtilities[target] === 1) continue;
      const unit = unitOf[target]!;
      if (stamp[unit] !== node) {
        stamp[unit] = node;
        weight[unit] = 0;
        touched.push(unit);
      }
      const w = graph.outWeights[e]!;
      weight[unit]! += w;
      total += w;
    }
    let others = 0;
    let largest = 0;
    for (const unit of touched) {
      if (unit !== own) others++;
      if (weight[unit]! > largest) largest = weight[unit]!;
    }
    const ownWeight = stamp[own] === node ? weight[own]! : 0;
    dependencyUnits[node] = others;
    // D-67: comparisons on exact sums; multiplying by 0.5 or 0.25 is exact.
    shape[node] =
      total > 0 &&
      others >= 2 &&
      largest <= ORCHESTRATOR_MAX_UNIT_SHARE * total &&
      ownWeight <= ORCHESTRATOR_MAX_OWN_SHARE * total
        ? 1
        : 0;
  }

  // 2b. The worklist fixpoint (D-30).
  const entry = new Uint8Array(n);
  for (let node = 0; node < n; node++) entry[node] = entryPoints.has(nodes[node]!) ? 1 : 0;
  const remaining = new Int32Array(n);
  const outside = new Int32Array(n);
  for (let node = 0; node < n; node++) {
    for (let e = graph.inOffsets[node]!; e < graph.inOffsets[node + 1]!; e++) {
      remaining[node]!++;
      if (unitOf[graph.inSources[e]!] !== unitOf[node]) outside[node]!++;
    }
  }
  const orchestrators = new Uint8Array(n);
  // A ring buffer: a node is queued at most once at a time, so n slots suffice.
  const queue = new Int32Array(Math.max(n, 1));
  const queued = new Uint8Array(n);
  for (let node = 0; node < n; node++) {
    queue[node] = node;
    queued[node] = 1;
  }
  let head = 0;
  let size = n;
  while (size > 0) {
    const node = queue[head]!;
    head = (head + 1) % queue.length;
    size--;
    queued[node] = 0;
    if (orchestrators[node] === 1 || firstPassUtilities[node] === 1) continue;
    const entryRule = entry[node] === 1 && remaining[node] === 0;
    const shapeRule = shape[node] === 1 && outside[node] === 0;
    if (!entryRule && !shapeRule) continue;
    orchestrators[node] = 1;
    // `node` no longer counts as a dependent of its dependencies.
    for (let e = graph.outOffsets[node]!; e < graph.outOffsets[node + 1]!; e++) {
      const target = graph.outTargets[e]!;
      remaining[target]!--;
      if (unitOf[target] !== unitOf[node]) outside[target]!--;
      if (orchestrators[target] === 0 && firstPassUtilities[target] === 0 && queued[target] === 0) {
        queue[(head + size) % queue.length] = target;
        size++;
        queued[target] = 1;
      }
    }
  }
  const orchestratorRule = new Uint8Array(n);
  for (let node = 0; node < n; node++) {
    if (orchestrators[node] === 0) continue;
    // Read at the fixpoint, so the recorded rule does not depend on the visiting order (D-30, D-66).
    orchestratorRule[node] =
      entry[node] === 1 && remaining[node] === 0 ? ENTRY_POINT_RULE : SHAPE_RULE;
  }

  // 3. Final utilities: orchestrators are ignored as dependents and are never utilities.
  marker.fill(-1);
  const utilities = new Uint8Array(n);
  const dependentUnits = new Int32Array(n);
  for (let node = 0; node < n; node++) {
    const count = dependentUnitCount(scope, unitOf, marker, node, orchestrators);
    dependentUnits[node] = count;
    utilities[node] = orchestrators[node] === 0 && count >= thresholdOf(node) ? 1 : 0;
  }

  // 4. Facades (D-04: admitted degrees, weight-0 pairs included).
  const facades = new Uint8Array(n);
  for (let node = 0; node < n; node++) {
    const admitted = admittedOutDegree[node]!;
    facades[node] = admitted > 0 && reexportOutDegree[node]! * 2 >= admitted ? 1 : 0;
  }

  // 5. Pinned nodes and evidence exclusion.
  const pinned = new Uint8Array(n);
  const excluded = new Uint8Array(n);
  for (let node = 0; node < n; node++) {
    const sharedUnit = units[unitOf[node]!]!.kind === "shared";
    excluded[node] = orchestrators[node]! | utilities[node]!;
    pinned[node] = excluded[node]! | facades[node]! | (sharedUnit ? 1 : 0);
  }

  return {
    classes: {
      orchestrators,
      orchestratorRule,
      dependencyUnits,
      utilities,
      dependentUnits,
      facades,
    },
    firstPassUtilities,
    pinned,
    excluded,
  };
}
