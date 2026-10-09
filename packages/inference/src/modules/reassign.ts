/**
 * P5 of module inference: prior-anchored strict-majority reassignment (§3.9; docs/ALGORITHMS.md, "Modules",
 * P5).
 *
 * The prior is overridden file by file, and only on unambiguous dependency evidence: a file moves to the
 * unit holding a strict majority of the weight of its dependents, with minimum weight and support, when it
 * also mostly depends on that unit. This is a constrained, deterministic relative of label propagation
 * (Raghavan, Albert & Kumara 2007): the label is the module, the prior is the initial labelling, and the
 * strict-majority, support and two-sided conditions implement the fixtures' definition of "mostly". Every
 * move is reported as a {@link Relocation}, which U4 turns into `relocated-files` evidence.
 *
 * Determinism: nodes are visited in ascending order and assignments update immediately; every sum is exact
 * (D-67), so majorities and ties are decided exactly; ties between units go to the smallest key, compared as
 * integer ranks.
 */
import { compareStrings } from "@katedrala/ir";
import type { InferenceSettings, Relocation, Scope } from "../types.js";
import type { ClassifiedNodes } from "./classes.js";
import type { Partition } from "./prior.js";

/** The result of P5 for one scope [KATEDRALA HEURISTIC] (§3.9). */
export interface Reassignment {
  /** Unit of every node after P2 and P4, before P5 (the prior of P5, D-36). */
  readonly priorOf: Int32Array;
  /** Nodes whose final unit differs from their prior unit, ascending (D-36). */
  readonly relocations: readonly Relocation[];
  /** Passes run, the last of which moved nothing when the process converged; at most `maxPasses`. */
  readonly passes: number;
  /** False when P5 stopped at `maxPasses` with moves pending (D-37). */
  readonly converged: boolean;
}

/** The evidence maps of a node's last move (D-36), keys in `compareStrings` order. */
interface MoveEvidence {
  readonly dependents: ReadonlyMap<string, { readonly weight: number; readonly files: number }>;
  readonly dependencies: ReadonlyMap<string, number>;
}

/**
 * P5, strict-majority reassignment [KATEDRALA HEURISTIC] (§3.9). A pass visits the nodes in ascending order
 * and skips pinned nodes (orchestrators, utilities, facades and files of shared units, D-35). For a node `f`
 * in unit `P`, the in-weights `inW`, supports and out-weights `outW` per unit are accumulated from its CSR
 * rows, skipping the arcs of orchestrators and utilities (they are no evidence, §3.7). `C` is the unit with
 * the largest `inW`, ties to the smallest key. `f` moves to `C` when all five conditions hold:
 *
 * 1. `C ≠ P` and `C` is a destination (feature, stem or split unit, D-35);
 * 2. `inW[C] > 0.5 · Σ inW` (a strict majority of its dependents' weight);
 * 3. `inW[C] ≥ moveMinWeight`;
 * 4. `support[C] ≥ (size(P) ≥ 2 ? moveMinSupport : 1)`, with `P`'s current size (D-74: a lone file cannot be
 *    held by its own unit, so singleton units are absorbed by the destination they serve, and a unit
 *    emptied down to one file can follow; every such move is still a strict majority);
 * 5. `Σ outW = 0` or `outW[C] > 0.5 · Σ outW` (it also mostly depends on `C`).
 *
 * Assignments update immediately. Passes repeat until one moves nothing, at most `maxPasses`. When the
 * last allowed pass still moved a file, one more pass is evaluated without applying anything: `converged`
 * is false exactly when it would move a file (D-37: U4 then reports `limit-reached`). Comparisons are on
 * exact sums (D-67).
 *
 * Relocations (D-36): one per node whose final unit differs from its prior unit (the unit after P2 and P4),
 * with the dependents' weight and file count and the dependencies' weight per unit key at its last move. A
 * file that moved away and back reports nothing.
 *
 * Complexity: O(passes · (n + m)) time with sparse per-unit accumulators, O(n + U) memory. Determinism: see
 * the module comment. `partition.unitOf` is updated in place.
 */
export function reassign(
  scope: Scope,
  partition: Partition,
  classified: ClassifiedNodes,
  settings: InferenceSettings,
): Reassignment {
  const { graph } = scope.graph;
  const { units, unitOf } = partition;
  const { pinned, excluded } = classified;
  const { moveMinSupport, moveMinWeight, maxPasses } = settings.modules;
  const n = graph.nodeCount;
  const unitCount = units.length;
  const priorOf = unitOf.slice();

  // Ties compare unit keys as integer ranks.
  const keyRank = new Int32Array(unitCount);
  [...units.keys()]
    .sort((a, b) => compareStrings(units[a]!.key, units[b]!.key))
    .forEach((unit, rank) => {
      keyRank[unit] = rank;
    });
  const unitSize = new Int32Array(unitCount);
  for (let node = 0; node < n; node++) unitSize[unitOf[node]!]!++;

  // Sparse per-unit accumulators: `touched` lists the units of the current evaluation, `seen` marks them.
  // Both are cleared at the start of every evaluation, so a node evaluated again in a later pass never
  // reads stale sums.
  const inW = new Float64Array(unitCount);
  const outW = new Float64Array(unitCount);
  const support = new Int32Array(unitCount);
  const seen = new Uint8Array(unitCount);
  const touched: number[] = [];
  const lastMove = new Map<number, MoveEvidence>();

  /** Start accumulating for `unit` in the current evaluation (once per evaluation). */
  const touch = (unit: number): void => {
    if (seen[unit] === 1) return;
    seen[unit] = 1;
    inW[unit] = 0;
    outW[unit] = 0;
    support[unit] = 0;
    touched.push(unit);
  };

  /** The destination of `node` when the five conditions hold, else -1; fills the accumulators. */
  const destinationOf = (node: number): number => {
    for (const unit of touched) seen[unit] = 0;
    touched.length = 0;
    let totalIn = 0;
    for (let e = graph.inOffsets[node]!; e < graph.inOffsets[node + 1]!; e++) {
      const source = graph.inSources[e]!;
      if (excluded[source] === 1) continue;
      const unit = unitOf[source]!;
      touch(unit);
      const w = graph.inWeights[e]!;
      inW[unit]! += w;
      support[unit]!++;
      totalIn += w;
    }
    if (totalIn === 0) return -1;
    let totalOut = 0;
    for (let e = graph.outOffsets[node]!; e < graph.outOffsets[node + 1]!; e++) {
      const target = graph.outTargets[e]!;
      if (excluded[target] === 1) continue;
      const unit = unitOf[target]!;
      touch(unit);
      const w = graph.outWeights[e]!;
      outW[unit]! += w;
      totalOut += w;
    }
    // C: the largest in-weight, ties to the smallest key.
    let best = -1;
    for (const unit of touched) {
      if (inW[unit]! === 0) continue;
      if (
        best === -1 ||
        inW[unit]! > inW[best]! ||
        (inW[unit] === inW[best] && keyRank[unit]! < keyRank[best]!)
      ) {
        best = unit;
      }
    }
    const current = unitOf[node]!;
    // D-67: every comparison is on exact sums; multiplying by 0.5 is exact.
    const moves =
      best !== current &&
      units[best]!.destination &&
      inW[best]! > 0.5 * totalIn &&
      inW[best]! >= moveMinWeight &&
      // D-74: the lone-file exception uses the unit's current size.
      support[best]! >= (unitSize[current]! >= 2 ? moveMinSupport : 1) &&
      (totalOut === 0 || outW[best]! > 0.5 * totalOut);
    return moves ? best : -1;
  };

  /** The evidence maps of the accumulators, keys in `compareStrings` order (D-36). */
  const evidence = (): MoveEvidence => {
    const ordered = [...touched].sort((a, b) => keyRank[a]! - keyRank[b]!);
    const dependents = new Map<string, { readonly weight: number; readonly files: number }>();
    const dependencies = new Map<string, number>();
    for (const unit of ordered) {
      const key = units[unit]!.key;
      if (support[unit]! > 0) dependents.set(key, { weight: inW[unit]!, files: support[unit]! });
      if (outW[unit]! > 0) dependencies.set(key, outW[unit]!);
    }
    return { dependents, dependencies };
  };

  let passes = 0;
  let converged = false;
  while (passes < maxPasses) {
    passes++;
    let moved = false;
    for (let node = 0; node < n; node++) {
      if (pinned[node] === 1) continue;
      const target = destinationOf(node);
      if (target === -1) continue;
      const from = unitOf[node]!;
      lastMove.set(node, evidence());
      unitOf[node] = target;
      unitSize[from]!--;
      unitSize[target]!++;
      moved = true;
    }
    if (!moved) {
      converged = true;
      break;
    }
  }
  if (!converged) {
    // D-37: the limit stopped the process; it converged only if one more pass would move nothing.
    converged = true;
    for (let node = 0; node < n; node++) {
      if (pinned[node] === 0 && destinationOf(node) !== -1) {
        converged = false;
        break;
      }
    }
  }

  const relocations: Relocation[] = [];
  for (let node = 0; node < n; node++) {
    if (unitOf[node] === priorOf[node]) continue;
    const move = lastMove.get(node);
    relocations.push({
      node,
      from: units[priorOf[node]!]!.key,
      to: units[unitOf[node]!]!.key,
      dependents: move?.dependents ?? new Map(),
      dependencies: move?.dependencies ?? new Map(),
    });
  }
  return { priorOf, relocations, passes, converged };
}
