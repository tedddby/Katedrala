/**
 * Layer order (§4.4; docs/ALGORITHMS.md, "Layers"): the observed layer dependency graph, the arcs that
 * point against the best order of each cycle (upward dependencies), conventional arcs between layers that no
 * observed path orders, and ranks.
 *
 * - The layer graph [DERIVED from the weighted file graph, D-51] sums the weights of the file pairs between
 *   two layers, on the same weighting as module inference.
 * - Cycles [ESTABLISHED]: within each strongly connected component (Tarjan 1972), the linear order with the
 *   least backward weight is found exactly by dynamic programming over subsets (D-52; Bodlaender, H. L.,
 *   Fomin, F. V., Koster, A. M. C. A., Kratsch, D. & Thilikos, D. M. 2012. "A note on exact algorithms for
 *   vertex ordering problems on graphs". Theory of Computing Systems 50(3):420–432), or approximated by the
 *   greedy heuristic of Eades, P., Lin, X. & Smyth, W. F. 1993 ("A fast and effective heuristic for the
 *   feedback arc set problem". Information Processing Letters 47(6):319–323) beyond
 *   `exact_order_max_layers`. Minimum feedback arc set is NP-complete (Karp 1972).
 * - Conventional arcs [KATEDRALA HEURISTIC] order layers that no observed path connects, by the conventional
 *   tiers (D-53).
 * - Ranks [ESTABLISHED]: the longest path from a layer nothing depends on, Lakos's levelization counted
 *   from the top (Lakos, J. 1996. "Large-Scale C++ Software Design". Addison-Wesley).
 *
 * Exact arithmetic (D-67): file-pair weights are 1 and `type_only_weight`, a multiple of 1/1024, so every
 * layer weight and every sum the ordering compares is exact; mathematical ties are ties.
 *
 * Determinism: layers are numbered in name order, every loop runs in index order, ties go to the
 * lexicographically smallest sequence, and conventional pairs are processed in a fixed order.
 */
import {
  Digraph,
  greedyFeedbackArcSet,
  longestPathLengths,
  stronglyConnectedComponents,
} from "@katedrala/graph";
import type { EdgeKind, FileId, FileRole } from "@katedrala/ir";
import type { ArchitectureModel } from "@katedrala/model";
import type { EdgeWeighting } from "../types.js";
import { buildWeightedFileGraph } from "../weighted-graph.js";
import type { LayerPartition } from "./partition.js";

/** Layers contain source files only, and the layer graph is built on them (D-51). */
const SOURCE_FILES: ReadonlySet<FileRole> = new Set<FileRole>(["source"]);

/**
 * The observed layer dependency graph H [DERIVED] (§4.4 step 1, D-51). Node `i` is the layer `layers[i]`
 * (names sorted); arc `A → B` (A ≠ B) carries `w(A, B)`, the sum of the weighted file graph's weights over
 * the distinct file pairs `u ∈ A`, `v ∈ B`. Only pairs of positive weight are arcs, so every arc has a
 * positive weight. The arrays below are indexed by the CSR out-edge index of `graph`.
 */
export interface LayerGraph {
  /** Layer names, sorted. */
  readonly layers: readonly string[];
  /** H: arcs between layers, weighted by `w(A, B)`. */
  readonly graph: Digraph;
  /** Per arc: the part of its weight that comes from type-only file pairs (D-51, for descriptions). */
  readonly typeOnlyWeights: Float64Array;
  /** Per arc: the number of file pairs. */
  readonly pairs: Int32Array;
  /** Per arc: the depending files (sources of the file pairs), sorted. */
  readonly dependingFiles: readonly (readonly FileId[])[];
}

/**
 * What {@link buildLayerGraph} reads besides the partition [KATEDRALA HEURISTIC parameters]: the weighting shared
 * with module inference and the edge kinds of the metrics projection (D-51).
 */
export interface LayerGraphOptions extends EdgeWeighting {
  /** The edge kinds of the metrics projection (D-51). */
  readonly edgeKinds: ReadonlySet<EdgeKind>;
}

/**
 * Build the layer graph H [DERIVED from the weighted file graph] (§4.4 step 1, plan 4.5, D-51):
 *
 * - the file graph is `buildWeightedFileGraph` over the `source` files with the metrics projection's edge
 *   kinds and the module weighting (`type_only_weight`, `min_edge_confidence`), without exclusion: layers
 *   are orthogonal to modules, so declared-module files take part. Type-only references always count at
 *   `type_only_weight`, also when `analysis.include_type_only` is false (D-02, D-51);
 * - `w(A, B)` sums the weights of the file pairs from members of A to members of B, A ≠ B; files in no layer
 *   do not count;
 * - the type-only share of each arc is the weight of its type-only pairs: pairs of weight `type_only_weight`
 *   when it is below 1, and pairs without an admitted runtime edge when it is 1 (found on a second weighted
 *   graph without type-only pairs, so the share is exact for every weighting).
 *
 * Complexity: O(n + m_IR + L²) time and O(n + m + L²) memory for n source files, m_IR relationships and L
 * layers (one more file graph pass when `type_only_weight` is 1). Determinism: file arcs are summed in CSR
 * order; the sums are exact (D-67).
 */
export function buildLayerGraph(
  model: ArchitectureModel,
  partition: LayerPartition,
  options: LayerGraphOptions,
): LayerGraph {
  const { layers, members } = partition;
  const count = layers.length;
  const weighting = {
    typeOnlyWeight: options.typeOnlyWeight,
    minEdgeConfidence: options.minEdgeConfidence,
    edgeKinds: options.edgeKinds,
    fileRoles: SOURCE_FILES,
  };
  const files = buildWeightedFileGraph(model, weighting);
  // With type_only_weight = 1 a weight cannot tell type-only pairs apart; the runtime pairs can.
  const runtime =
    options.typeOnlyWeight === 1
      ? buildWeightedFileGraph(model, { ...weighting, typeOnlyWeight: 0 })
      : undefined;
  const layerOf = new Int32Array(files.nodes.length).fill(-1);
  members.forEach((list, layer) => {
    for (const file of list) {
      const node = files.indexOf(file);
      if (node !== -1) layerOf[node] = layer;
    }
  });

  const weights = new Float64Array(count * count);
  const typeOnly = new Float64Array(count * count);
  const pairs = new Int32Array(count * count);
  const depending = new Map<number, number[]>();
  const { outOffsets, outTargets, outWeights } = files.graph;
  for (let u = 0; u < files.nodes.length; u++) {
    const a = layerOf[u]!;
    if (a === -1) continue;
    for (let e = outOffsets[u]!; e < outOffsets[u + 1]!; e++) {
      const v = outTargets[e]!;
      const b = layerOf[v]!;
      if (b === -1 || b === a) continue;
      const cell = a * count + b;
      const weight = outWeights[e]!;
      weights[cell]! += weight;
      pairs[cell]!++;
      // The runtime graph has the same nodes (same projection, no exclusion).
      const isTypeOnly = runtime === undefined ? weight !== 1 : !runtime.graph.hasEdge(u, v);
      if (isTypeOnly) typeOnly[cell]! += weight;
      // Out-arcs of one file are consecutive, so comparing with the last entry de-duplicates.
      const sources = depending.get(cell);
      if (sources === undefined) depending.set(cell, [u]);
      else if (sources[sources.length - 1] !== u) sources.push(u);
    }
  }

  const arcSources: number[] = [];
  const arcTargets: number[] = [];
  const arcWeights: number[] = [];
  const arcTypeOnly: number[] = [];
  const arcPairs: number[] = [];
  const arcFiles: FileId[][] = [];
  for (let a = 0; a < count; a++) {
    for (let b = 0; b < count; b++) {
      const cell = a * count + b;
      if (pairs[cell] === 0) continue;
      arcSources.push(a);
      arcTargets.push(b);
      arcWeights.push(weights[cell]!);
      arcTypeOnly.push(typeOnly[cell]!);
      arcPairs.push(pairs[cell]!);
      arcFiles.push((depending.get(cell) ?? []).map((node) => files.nodes[node]!));
    }
  }
  // The arcs are distinct and in (source, target) order, so out-edge i of the graph is arc i.
  return {
    layers,
    graph: Digraph.fromEdges(count, arcSources, arcTargets, arcWeights),
    typeOnlyWeights: Float64Array.from(arcTypeOnly),
    pairs: Int32Array.from(arcPairs),
    dependingFiles: arcFiles,
  };
}

/** The `[weight, inversions]` cost of placing layer `a` right after the layers of `placed` (D-52). */
function placementCost(
  a: number,
  placed: number,
  k: number,
  weights: ArrayLike<number>,
  tiers: readonly (number | undefined)[],
): [weight: number, inversions: number] {
  let weight = 0;
  let inversions = 0;
  const tier = tiers[a];
  for (let b = 0; b < k; b++) {
    if ((placed & (1 << b)) === 0) continue;
    // An arc from `a` back to a layer placed earlier points against the order.
    weight += weights[a * k + b]!;
    // An inversion counts only when both layers have a conventional tier (the prototype's rule).
    const other = tiers[b];
    if (tier !== undefined && other !== undefined && other > tier) inversions++;
  }
  return [weight, inversions];
}

/**
 * The exact best linear order of a strongly connected set of layers [ESTABLISHED: subset dynamic
 * programming for vertex-ordering problems, Bodlaender et al. 2012] (§4.4 step 2, D-52).
 *
 * The `k` layers are numbered `0..k−1` in name order; `weights[a · k + b]` is `w(a, b)` and `tiers[a]` the
 * conventional tier of `a` (undefined when it has none). For the set S of layers still to place after the
 * placed set P, `best(S) = min over a ∈ S of cost(a, P) + best(S \ {a})` with
 * `cost(a, P) = (Σ_{b ∈ P} w(a, b), #{b ∈ P : tier(a), tier(b) defined, tier(b) > tier(a)})`: arcs from `a`
 * back to placed layers point upward, and placing an inner tier before an outer one is an inversion. Costs
 * compare lexicographically (backward weight, then inversions); the sums are exact for lattice weights
 * (D-67). The order is reconstructed from the full set, taking at each step the smallest `a` that attains the
 * optimum, which gives the lexicographically smallest optimal sequence.
 *
 * Returns the order as a sequence of the indices `0..k−1`.
 *
 * Complexity: O(2^k · k²) time, O(2^k) memory (about 600 000 steps for k = 12). Determinism: index order
 * throughout.
 *
 * @throws {RangeError} when `k` exceeds 24 (the subset tables would not fit) or `weights` is not k × k.
 */
export function exactLayerOrder(
  weights: ArrayLike<number>,
  tiers: readonly (number | undefined)[],
): number[] {
  const k = tiers.length;
  if (k > 24) throw new RangeError(`The exact layer order handles at most 24 layers, got ${k}`);
  if (weights.length !== k * k) {
    throw new RangeError(`Expected ${k * k} weights for ${k} layers, got ${weights.length}`);
  }
  const size = 1 << k;
  const full = size - 1;
  const bestWeight = new Float64Array(size);
  const bestInversions = new Int32Array(size);
  // S \ {a} < S, so increasing S visits every subset after its subsets.
  for (let rest = 1; rest < size; rest++) {
    const placed = full ^ rest;
    let weight = Number.POSITIVE_INFINITY;
    let inversions = Number.POSITIVE_INFINITY;
    for (let a = 0; a < k; a++) {
      const bit = 1 << a;
      if ((rest & bit) === 0) continue;
      const [w, i] = placementCost(a, placed, k, weights, tiers);
      const totalWeight = w + bestWeight[rest ^ bit]!;
      const totalInversions = i + bestInversions[rest ^ bit]!;
      if (totalWeight < weight || (totalWeight === weight && totalInversions < inversions)) {
        weight = totalWeight;
        inversions = totalInversions;
      }
    }
    bestWeight[rest] = weight;
    bestInversions[rest] = inversions;
  }
  // Reconstruction: the smallest layer that attains the optimum at each step.
  const sequence: number[] = [];
  let rest = full;
  while (rest !== 0) {
    const placed = full ^ rest;
    for (let a = 0; a < k; a++) {
      const bit = 1 << a;
      if ((rest & bit) === 0) continue;
      const [w, i] = placementCost(a, placed, k, weights, tiers);
      if (
        w + bestWeight[rest ^ bit]! === bestWeight[rest] &&
        i + bestInversions[rest ^ bit]! === bestInversions[rest]
      ) {
        sequence.push(a);
        rest ^= bit;
        break;
      }
    }
  }
  return sequence;
}

/**
 * The result of {@link orderLayers} [KATEDRALA HEURISTIC]: the inferred order of the layers of a
 * {@link LayerGraph}, as removed arcs (upward dependencies), conventional arcs and ranks. Layers are indices
 * into `LayerGraph.layers`.
 */
export interface LayerOrder {
  /** Arcs of H against the order (upward dependencies), `[source, target]` layer indices, sorted. */
  readonly removed: readonly (readonly [number, number])[];
  /** Conventional arcs `[outer, inner]`, in the order they were added (D-53). */
  readonly conventional: readonly (readonly [number, number])[];
  /** The rank of every layer: 0 for the outermost layers. */
  readonly ranks: Int32Array;
  /** Whether an arc of H (by CSR out-edge index) was removed. */
  readonly isRemoved: Uint8Array;
  /** Strongly connected sets of layers ordered by the greedy approximation (layer indices, ascending). */
  readonly approximated: readonly (readonly number[])[];
}

/**
 * What {@link orderLayers} reads besides the layer graph [KATEDRALA HEURISTIC parameters]: the conventional tiers,
 * the bound of the exact ordering and the packages of each layer (D-52, D-53).
 */
export interface LayerOrderOptions {
  /** Layer name → conventional tier, 0 = outermost (`vocabulary.tiers`). */
  readonly tiers: ReadonlyMap<string, number>;
  /** Strongly connected sets up to this size are ordered exactly (`exact_order_max_layers`). */
  readonly exactOrderMaxLayers: number;
  /**
   * Per layer: the packages its members belong to, `""` for files without a package (review #22). Two
   * layers share a package when these sets intersect (D-53).
   */
  readonly packages: readonly ReadonlySet<string>[];
}

/** Whether `target` is reachable from `source` (BFS over adjacency lists of a small graph). */
function reaches(
  adjacency: readonly (readonly number[])[],
  source: number,
  target: number,
): boolean {
  const seen = new Uint8Array(adjacency.length);
  const queue = [source];
  seen[source] = 1;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head]!;
    if (node === target) return true;
    for (const next of adjacency[node]!) {
      if (seen[next] === 1) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return false;
}

/** Whether two sets intersect. */
function intersects(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const value of a) if (b.has(value)) return true;
  return false;
}

/**
 * Order the layers of H [KATEDRALA HEURISTIC on ESTABLISHED algorithms] (§4.4 steps 2–4, plan 4.5):
 *
 * 1. the strongly connected components of H;
 * 2. every non-trivial component of at most `exactOrderMaxLayers` layers is ordered by
 *    {@link exactLayerOrder} (D-52); larger ones by `greedyFeedbackArcSet` on the induced subgraph, which is
 *    unweighted and an approximation (Eades et al. 1993). The arcs that point backwards are removed: they are
 *    the upward dependencies;
 * 3. conventional arcs (D-53): pairs `(A, B)` with `tier(A) < tier(B)` that share a package (files without
 *    a package share the package `""`) are processed by `(tier(A), tier(B), A, B)`; `A → B` is added with
 *    weight 0 when neither layer reaches the other in the current graph (kept observed arcs and the
 *    conventional arcs added so far). An added arc therefore never closes a cycle, and the order of
 *    processing is the specification;
 * 4. ranks: `longestPathLengths(D, "in")` for D = H without the removed arcs plus the conventional arcs,
 *    so that every arc of D, observed or conventional, goes to a strictly higher rank. Rank 0 holds the
 *    layers nothing depends on: in classic layering the data layer gets the highest rank, in clean
 *    architecture the domain does, and presentation and infrastructure share rank 0.
 *
 * Complexity: O(L + E_H + Σ 2^k k² + L² · (L + E_D)) for L layers. Determinism: index (= name) order
 * throughout; exact sums (D-67).
 */
export function orderLayers(graph: LayerGraph, options: LayerOrderOptions): LayerOrder {
  const h = graph.graph;
  const count = h.nodeCount;
  const { outOffsets, outTargets, outWeights } = h;
  const tierOf = (layer: number): number | undefined =>
    options.tiers.get(graph.layers[layer] ?? "");
  const isRemoved = new Uint8Array(h.edgeCount);
  const approximated: number[][] = [];

  for (const component of stronglyConnectedComponents(h).components) {
    // H has no self-loops, so only components of two or more layers contain a cycle.
    if (component.length < 2) continue;
    const members = Array.from(component);
    const local = new Map(members.map((layer, index) => [layer, index] as const));
    const position = new Int32Array(count).fill(-1);
    if (members.length <= options.exactOrderMaxLayers) {
      // D-52: members are ascending node numbers, i.e. in name order.
      const k = members.length;
      const weights = new Float64Array(k * k);
      for (const [index, layer] of members.entries()) {
        for (let e = outOffsets[layer]!; e < outOffsets[layer + 1]!; e++) {
          const target = local.get(outTargets[e]!);
          if (target !== undefined) weights[index * k + target] = outWeights[e]!;
        }
      }
      exactLayerOrder(weights, members.map(tierOf)).forEach((index, place) => {
        position[members[index]!] = place;
      });
    } else {
      // Beyond the bound: the unweighted greedy approximation on the induced subgraph.
      approximated.push(members);
      const { graph: induced, mapping } = h.inducedSubgraph(component);
      const backward = new Set(
        greedyFeedbackArcSet(induced).map(([s, t]) => `${mapping[s]!} ${mapping[t]!}`),
      );
      for (const layer of members) {
        for (let e = outOffsets[layer]!; e < outOffsets[layer + 1]!; e++) {
          if (backward.has(`${layer} ${outTargets[e]!}`)) isRemoved[e] = 1;
        }
      }
      continue;
    }
    for (const layer of members) {
      for (let e = outOffsets[layer]!; e < outOffsets[layer + 1]!; e++) {
        const target = outTargets[e]!;
        if (local.has(target) && position[layer]! > position[target]!) isRemoved[e] = 1;
      }
    }
  }

  const removed: [number, number][] = [];
  const adjacency: number[][] = Array.from({ length: count }, () => []);
  for (let a = 0; a < count; a++) {
    for (let e = outOffsets[a]!; e < outOffsets[a + 1]!; e++) {
      if (isRemoved[e] === 1) removed.push([a, outTargets[e]!]);
      else adjacency[a]!.push(outTargets[e]!);
    }
  }

  // D-53: conventional arcs, processed by (tier(A), tier(B), A, B).
  const candidates: [number, number][] = [];
  for (let a = 0; a < count; a++) {
    for (let b = 0; b < count; b++) {
      const ta = tierOf(a);
      const tb = tierOf(b);
      if (ta !== undefined && tb !== undefined && ta < tb) candidates.push([a, b]);
    }
  }
  candidates.sort(
    ([a1, b1], [a2, b2]) =>
      tierOf(a1)! - tierOf(a2)! || tierOf(b1)! - tierOf(b2)! || a1 - a2 || b1 - b2,
  );
  const conventional: [number, number][] = [];
  for (const [a, b] of candidates) {
    // D-53, D-55: only layers that share a package are ordered by convention; unrelated packages of a
    // monorepo keep rank 0 and a low order-support (Q-4 keeps the design).
    if (!intersects(options.packages[a] ?? new Set(), options.packages[b] ?? new Set())) continue;
    if (reaches(adjacency, a, b) || reaches(adjacency, b, a)) continue;
    adjacency[a]!.push(b);
    conventional.push([a, b]);
  }

  const sources: number[] = [];
  const targets: number[] = [];
  adjacency.forEach((next, a) => {
    for (const b of next) {
      sources.push(a);
      targets.push(b);
    }
  });
  const dag = Digraph.fromEdges(count, sources, targets);
  return {
    removed,
    conventional,
    ranks: longestPathLengths(dag, "in"),
    isRemoved,
    approximated,
  };
}
