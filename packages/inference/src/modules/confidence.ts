/**
 * P9 of module inference: the measurements behind the confidence of an inferred module (§3.13; plan 4.4 P9;
 * docs/ALGORITHMS.md, "Modules", P9) [KATEDRALA HEURISTIC].
 *
 * The confidence of an inferred module is the weighted sum of a few measurements, with fixed weights per
 * unit kind (§3.13; Q-10: the weights are part of the method `katedrala/module-inference@1`, not
 * configuration):
 *
 * | Kind | Weighted signals |
 * | --- | --- |
 * | feature, stem, split | `internal-edge-ratio` 0.40, `membership-margin` 0.25, `prior-agreement` 0.20, `module-size` 0.15 |
 * | layer | `internal-edge-ratio` 0.50, `prior-agreement` 0.30, `module-size` 0.20 |
 * | shared | `shared-usage` 0.50, `prior-agreement` 0.30, `module-size` 0.20 |
 * | root | `wiring-share` 0.30, `prior-agreement` 0.50, `module-size` 0.20 |
 *
 * Cohesion is the primary structural property of a module (Bunch's MQ, modularity); the margin captures how
 * unambiguous each member's membership is; agreement between the dependency evidence and the developers' own
 * structure (directory or file-name stem) is independent corroboration; tiny modules carry little evidence
 * (§3.13). The weights are judgement, not fitted, and the confidence is not a probability. No term is
 * normalized by a snapshot maximum, so values compare across snapshots and repositories.
 *
 * Every measurement is computed per scope in one pass over the *evidence graph*: the scope graph with the
 * arcs of composition roots and utilities skipped (§3.13), restricted to node members (attached tests and
 * declarations never count, §3.11). `shared-usage` reads the scope graph with only composition roots removed
 * (D-46).
 *
 * Determinism: nodes are visited in ascending order (file id order) and arcs in CSR order. Weight sums are
 * exact (D-67: every weight is a multiple of 1/1024), so the comparisons that decide contested members are
 * exact; each quotient is computed once from exact sums.
 */
import type { FileId } from "@katedrala/ir";
import type { ScopeClustering, UnitKind } from "../types.js";

/** The weighted module signals [KATEDRALA HEURISTIC] (§3.13, §5.2); signal ids are part of the output contract. */
export type ModuleSignal =
  | "internal-edge-ratio"
  | "membership-margin"
  | "prior-agreement"
  | "module-size"
  | "shared-usage"
  | "wiring-share";

/** One weighted signal of a unit kind and its weight [KATEDRALA HEURISTIC] (§3.13; Q-10). */
export interface SignalWeight {
  readonly signal: ModuleSignal;
  readonly weight: number;
}

/** Feature, stem and split units share one set of signals (§3.13; D-48 tells them apart). */
const COHESION_WEIGHTS: readonly SignalWeight[] = Object.freeze([
  Object.freeze({ signal: "internal-edge-ratio", weight: 0.4 }),
  Object.freeze({ signal: "membership-margin", weight: 0.25 }),
  Object.freeze({ signal: "prior-agreement", weight: 0.2 }),
  Object.freeze({ signal: "module-size", weight: 0.15 }),
] as const);

/**
 * The weighted signals of each unit kind and their weights [KATEDRALA HEURISTIC] (§3.13). Each list sums to
 * 1 and is fixed per kind, so every module of a kind lists the same signals, absent ones included (D-45).
 * The weights are constants of `katedrala/module-inference@1` (Q-10).
 *
 * Complexity: O(1) lookups. Determinism: frozen constants.
 */
export const MODULE_SIGNAL_WEIGHTS: Readonly<Record<UnitKind, readonly SignalWeight[]>> =
  Object.freeze({
    feature: COHESION_WEIGHTS,
    stem: COHESION_WEIGHTS,
    split: COHESION_WEIGHTS,
    layer: Object.freeze([
      Object.freeze({ signal: "internal-edge-ratio", weight: 0.5 }),
      Object.freeze({ signal: "prior-agreement", weight: 0.3 }),
      Object.freeze({ signal: "module-size", weight: 0.2 }),
    ] as const),
    shared: Object.freeze([
      Object.freeze({ signal: "shared-usage", weight: 0.5 }),
      Object.freeze({ signal: "prior-agreement", weight: 0.3 }),
      Object.freeze({ signal: "module-size", weight: 0.2 }),
    ] as const),
    root: Object.freeze([
      Object.freeze({ signal: "wiring-share", weight: 0.3 }),
      Object.freeze({ signal: "prior-agreement", weight: 0.5 }),
      Object.freeze({ signal: "module-size", weight: 0.2 }),
    ] as const),
  });

/** A member used by exactly one other unit, and that unit [KATEDRALA HEURISTIC] (§3.13, D-46). */
export interface SingleUser {
  /** Scope node. */
  readonly node: number;
  /** Index into `ScopeClustering.units`. */
  readonly unit: number;
}

/**
 * The measurements of one unit [KATEDRALA HEURISTIC] (§3.13), computed for every unit whatever its kind;
 * {@link MODULE_SIGNAL_WEIGHTS} selects the weighted ones. Node lists are ascending scope nodes.
 */
export interface UnitSignals {
  /** n: node members (attached files are never counted). */
  readonly files: number;
  /** W_in: weight of the evidence arcs between members. */
  readonly internalWeight: number;
  /** W_cut: weight of the evidence arcs between members and other nodes of the scope, either direction. */
  readonly cutWeight: number;
  /** `2·W_in / (2·W_in + W_cut)`; undefined when the members have no evidence arc (D-45). */
  readonly internalEdgeRatio: number | undefined;
  /** Members with dependents, or else dependencies, in the evidence graph. */
  readonly membersWithEvidence: number;
  /** Mean of `max(0, own − best other)` over the members with evidence; undefined when there are none. */
  readonly membershipMargin: number | undefined;
  /** Members with evidence whose own weight does not exceed the best other unit's (margin 0, D-47). */
  readonly contested: readonly number[];
  /** `|members ∩ prior|`. */
  readonly retained: number;
  /** `|members ∪ prior|`. */
  readonly union: number;
  /** `retained / union`: Jaccard similarity of the members and the prior. */
  readonly priorAgreement: number;
  /** Members that were not in the prior: files P5 reassigned here. */
  readonly movedIn: readonly number[];
  /** Prior members that are no longer members: files P5 reassigned elsewhere. */
  readonly movedOut: readonly number[];
  /** `n / (n + 2)`. */
  readonly moduleSize: number;
  /** Members whose dependents (composition roots ignored, utilities kept) lie in ≥ 2 other units (D-46). */
  readonly sharedFiles: readonly number[];
  /** `|sharedFiles| / n`. */
  readonly sharedUsage: number;
  /** Members whose dependents (composition roots ignored) lie in exactly one other unit (D-46). */
  readonly singleUsers: readonly SingleUser[];
  /** Members that are composition roots, barrels (facades) or declared entry points, each once (review #10). */
  readonly wiringFiles: readonly number[];
  /** `|wiringFiles| / n`. */
  readonly wiringShare: number;
  /**
   * Connected components of the prior members in the scope graph (undirected view, every arc): 1 for a stem
   * unit whose stem formed one connected group, more when P2 kept the union of several (D-27).
   */
  readonly priorComponents: number;
}

/**
 * The value of a weighted signal of a unit [KATEDRALA HEURISTIC] (§3.13); undefined when it cannot be
 * computed, in which case it is still listed and contributes 0 (D-45).
 *
 * Complexity: O(1). Determinism: a pure function of its arguments.
 */
export function signalValue(signals: UnitSignals, signal: ModuleSignal): number | undefined {
  switch (signal) {
    case "internal-edge-ratio":
      return signals.internalEdgeRatio;
    case "membership-margin":
      return signals.membershipMargin;
    case "prior-agreement":
      return signals.priorAgreement;
    case "module-size":
      return signals.moduleSize;
    case "shared-usage":
      return signals.sharedUsage;
    case "wiring-share":
      return signals.wiringShare;
  }
}

/** Union-find root with path halving. */
function find(parent: Int32Array, node: number): number {
  let current = node;
  while (parent[current]! !== current) {
    parent[current] = parent[parent[current]!]!;
    current = parent[current]!;
  }
  return current;
}

/**
 * P9, the measurements of every unit of one scope [KATEDRALA HEURISTIC] (§3.13; plan 4.4 P9). The result is
 * parallel to `clustering.units`.
 *
 * - `internal-edge-ratio`: `2·W_in / (2·W_in + W_cut)` on the evidence graph (composition roots' and
 *   utilities' arcs skipped), both sums accumulated per unit in one pass over the arcs. It equals
 *   1 − cut/volume, i.e. 1 − conductance when the module is the smaller side (Kannan, Vempala & Vetta 2004).
 *   Undefined when the members have no evidence arc (D-45).
 * - `membership-margin`: for every member that is neither a composition root nor a utility, the weights of
 *   its dependents grouped by unit, or of its dependencies when it has no dependents, all on the evidence
 *   graph; its margin is `max(0, own − best other) / total`. The mean runs over the members with evidence.
 *   A margin of δ means the member's own share would have to fall by δ/2 before another unit could tie.
 *   Contested members are those whose own weight does not exceed the best other unit's, compared on exact
 *   sums (D-47, D-67).
 * - `prior-agreement`: `|members ∩ prior| / |members ∪ prior|` by a merge of the two ascending arrays; the
 *   differences are the files P5 moved in and out.
 * - `module-size`: `n / (n + 2)` with n node members: 1 file → 0.33, 5 → 0.71, 20 → 0.91.
 * - `shared-usage` (D-46): the share of members whose dependents lie in at least two other units, on the
 *   scope graph with only composition roots removed: utilities are what shared modules are for, so their
 *   uses count (removing them would give layered-architecture's `shared` 0 instead of §3.16's 0.80).
 *   Members used by exactly one other unit are listed too (`single-user-files`).
 * - `wiring-share`: the share of members that are composition roots, barrels or declared entry points
 *   (`entryPoints`, D-31), each member counted once (review #10: counting `src/main.ts` both as a composition
 *   root and as an entry point gave layered-architecture's root module 1.167, above the schema maximum).
 *
 * Complexity: O(n + m + U) time and O(n + U) memory for n nodes, m arcs and U units. Determinism: ascending
 * nodes, CSR order, exact sums (D-67).
 *
 * @param entryPoints - the files of the document's declared entry points (D-31).
 */
export function moduleSignals(
  clustering: ScopeClustering,
  entryPoints: ReadonlySet<FileId>,
): UnitSignals[] {
  const { scope, units, unitOf, classes } = clustering;
  const { graph } = scope.graph;
  const { nodes } = scope.graph;
  const n = graph.nodeCount;
  const unitCount = units.length;
  const { orchestrators, utilities, facades } = classes;

  // The evidence graph (§3.13): the arcs of composition roots and utilities do not count.
  const excluded = new Uint8Array(n);
  for (let node = 0; node < n; node++) {
    excluded[node] = orchestrators[node] === 1 || utilities[node] === 1 ? 1 : 0;
  }

  // internal-edge-ratio: W_in and W_cut per unit, exact sums (D-67).
  const internal = new Float64Array(unitCount);
  const cut = new Float64Array(unitCount);
  for (let u = 0; u < n; u++) {
    if (excluded[u] === 1) continue;
    const a = unitOf[u]!;
    for (let e = graph.outOffsets[u]!; e < graph.outOffsets[u + 1]!; e++) {
      const v = graph.outTargets[e]!;
      if (excluded[v] === 1) continue;
      const weight = graph.outWeights[e]!;
      const b = unitOf[v]!;
      if (a === b) {
        internal[a]! += weight;
      } else {
        cut[a]! += weight;
        cut[b]! += weight;
      }
    }
  }

  // membership-margin (D-47): a sparse accumulator per member, reset through its touched list.
  const marginSum = new Float64Array(unitCount);
  const withEvidence = new Int32Array(unitCount);
  const contested: number[][] = units.map(() => []);
  const accumulated = new Float64Array(unitCount);
  const touched = new Int32Array(unitCount);
  for (let u = 0; u < n; u++) {
    if (excluded[u] === 1) continue;
    const own = unitOf[u]!;
    let size = 0;
    let total = 0;
    // Dependents first; dependencies only when the member has no dependent with evidence.
    for (let e = graph.inOffsets[u]!; e < graph.inOffsets[u + 1]!; e++) {
      const s = graph.inSources[e]!;
      if (excluded[s] === 1) continue;
      const b = unitOf[s]!;
      if (accumulated[b] === 0) touched[size++] = b;
      accumulated[b]! += graph.inWeights[e]!;
      total += graph.inWeights[e]!;
    }
    if (total === 0) {
      for (let e = graph.outOffsets[u]!; e < graph.outOffsets[u + 1]!; e++) {
        const v = graph.outTargets[e]!;
        if (excluded[v] === 1) continue;
        const b = unitOf[v]!;
        if (accumulated[b] === 0) touched[size++] = b;
        accumulated[b]! += graph.outWeights[e]!;
        total += graph.outWeights[e]!;
      }
    }
    if (total > 0) {
      const ownWeight = accumulated[own]!;
      let bestOther = 0;
      for (let index = 0; index < size; index++) {
        const b = touched[index]!;
        if (b !== own && accumulated[b]! > bestOther) bestOther = accumulated[b]!;
      }
      withEvidence[own]!++;
      // D-47: compared on exact sums; the quotient is computed once.
      if (ownWeight > bestOther) marginSum[own]! += (ownWeight - bestOther) / total;
      else contested[own]!.push(u);
    }
    for (let index = 0; index < size; index++) accumulated[touched[index]!] = 0;
  }

  // shared-usage and single users (D-46): distinct other units among the non-orchestrator dependents.
  const sharedFiles: number[][] = units.map(() => []);
  const singleUsers: SingleUser[][] = units.map(() => []);
  const stamp = new Int32Array(unitCount).fill(-1);
  for (let v = 0; v < n; v++) {
    const own = unitOf[v]!;
    let distinct = 0;
    let user = -1;
    for (let e = graph.inOffsets[v]!; e < graph.inOffsets[v + 1]!; e++) {
      const s = graph.inSources[e]!;
      if (orchestrators[s] === 1) continue;
      const b = unitOf[s]!;
      if (b === own || stamp[b] === v) continue;
      stamp[b] = v;
      distinct++;
      user = b;
    }
    if (distinct >= 2) sharedFiles[own]!.push(v);
    else if (distinct === 1) singleUsers[own]!.push({ node: v, unit: user });
  }

  // wiring-share (review #10): each member once, whichever classes it belongs to.
  const wiringFiles: number[][] = units.map(() => []);
  for (let v = 0; v < n; v++) {
    const file = nodes[v]!;
    if (orchestrators[v] === 1 || facades[v] === 1 || entryPoints.has(file)) {
      wiringFiles[unitOf[v]!]!.push(v);
    }
  }

  // Connected components of each unit's prior members (undirected view of every arc, D-27).
  const priorOf = new Int32Array(n).fill(-1);
  units.forEach((unit, index) => {
    for (const node of unit.prior) priorOf[node] = index;
  });
  const parent = new Int32Array(n);
  for (let node = 0; node < n; node++) parent[node] = node;
  for (let u = 0; u < n; u++) {
    const p = priorOf[u]!;
    if (p === -1) continue;
    for (let e = graph.outOffsets[u]!; e < graph.outOffsets[u + 1]!; e++) {
      const v = graph.outTargets[e]!;
      if (priorOf[v] !== p) continue;
      const a = find(parent, u);
      const b = find(parent, v);
      // The smaller node becomes the root, so roots do not depend on the arc order.
      if (a < b) parent[b] = a;
      else if (b < a) parent[a] = b;
    }
  }

  return units.map((unit, index): UnitSignals => {
    const { members, prior } = unit;
    // prior-agreement: merge of the two ascending arrays.
    const movedIn: number[] = [];
    const movedOut: number[] = [];
    let retained = 0;
    let i = 0;
    let j = 0;
    while (i < members.length || j < prior.length) {
      if (j >= prior.length || (i < members.length && members[i]! < prior[j]!)) {
        movedIn.push(members[i]!);
        i++;
      } else if (i >= members.length || prior[j]! < members[i]!) {
        movedOut.push(prior[j]!);
        j++;
      } else {
        retained++;
        i++;
        j++;
      }
    }
    const union = retained + movedIn.length + movedOut.length;
    let components = 0;
    for (const node of prior) if (find(parent, node) === node) components++;
    const files = members.length;
    const internalWeight = internal[index]!;
    const cutWeight = cut[index]!;
    const volume = 2 * internalWeight + cutWeight;
    const evidence = withEvidence[index]!;
    const shared = sharedFiles[index]!;
    const wiring = wiringFiles[index]!;
    return {
      files,
      internalWeight,
      cutWeight,
      // D-45: no evidence arc, no value.
      internalEdgeRatio: volume > 0 ? (2 * internalWeight) / volume : undefined,
      membersWithEvidence: evidence,
      membershipMargin: evidence > 0 ? marginSum[index]! / evidence : undefined,
      contested: contested[index]!,
      retained,
      union,
      // Units are never empty (P6 drops empty units); an empty one would agree with itself.
      priorAgreement: union === 0 ? 1 : retained / union,
      movedIn,
      movedOut,
      moduleSize: files / (files + 2),
      sharedFiles: shared,
      sharedUsage: files === 0 ? 0 : shared.length / files,
      singleUsers: singleUsers[index]!,
      wiringFiles: wiring,
      wiringShare: files === 0 ? 0 : wiring.length / files,
      priorComponents: components,
    };
  });
}
