/**
 * Community structure of undirected weighted graphs: modularity and Louvain clustering.
 */

import { GraphError, UndirectedGraph } from "./digraph.js";
import { assertInteger } from "./internal.js";

/** Options of {@link louvain}. */
export interface LouvainOptions {
  /** Resolution γ of the modularity objective (default 1); larger values favour smaller communities. */
  resolution?: number;
  /**
   * Warm start: a community label for every node (any integers). The first level starts from this partition
   * instead of singletons.
   */
  initialCommunities?: ArrayLike<number>;
  /** Maximum number of levels, i.e. local-moving phases each followed by aggregation (default unlimited). */
  maxLevels?: number;
  /** Maximum number of passes over all nodes within one local-moving phase (default 1000). */
  maxPasses?: number;
  /**
   * A node moves only when its best community improves modularity by more than this amount over staying
   * (default 1e-12). Guards against moves that only reflect rounding error.
   */
  minModularityGain?: number;
  /**
   * A local-moving phase ends after a pass whose moves improved modularity by at most this amount in total
   * (default 1e-7), as in the reference implementation of Blondel et al., which uses 1e-6. Without it, the
   * long tail of tiny improvements can take hundreds of passes on graphs without clear community structure.
   * Set it to 0 to iterate until no node moves (or `maxPasses`).
   */
  minPassGain?: number;
}

/** Result of {@link louvain}. */
export interface LouvainResult {
  /** Community of every node, numbered 0..count − 1 in order of smallest member. */
  readonly communities: Int32Array;
  /** Number of communities. */
  readonly count: number;
  /** Modularity of `communities` (see {@link modularity}) at the requested resolution. */
  readonly modularity: number;
  /** Number of levels whose local-moving phase ran. */
  readonly levels: number;
}

/**
 * Modularity of a partition of an undirected weighted graph (Newman, M. E. J. & Girvan, M. 2004. "Finding and
 * evaluating community structure in networks". Physical Review E 69(2):026113), with the resolution parameter
 * γ of Reichardt, J. & Bornholdt, S. 2006. "Statistical mechanics of community detection". Physical Review E
 * 74(1):016110:
 *
 * `Q = (1/2m) Σ_ij [A_ij − γ k_i k_j / 2m] δ(c_i, c_j)`
 *
 * where m is the total edge weight (each edge counted once), A_ij the edge weight between i and j, k_i the
 * weighted degree, and a self-loop of weight w contributes 2w to both A_ii and k_i (consistent with
 * {@link UndirectedGraph.strength}). Evaluated per community as Σ_c [in_c / 2m − γ (tot_c / 2m)²]. Returns 0
 * when m = 0. Weights are taken as given (meaningful results require non-negative weights).
 *
 * Complexity: O(n + m) time, O(n) space. Determinism: sums run in ascending node and community order.
 *
 * @param communities - a community label (any integer) for every node.
 * @throws GraphError if `communities` has the wrong length or a non-integer label.
 */
export function modularity(
  graph: UndirectedGraph,
  communities: ArrayLike<number>,
  resolution = 1,
): number {
  const { community, count } = relabel(graph.nodeCount, communities);
  return modularityOf(graph, community, count, resolution);
}

/**
 * Louvain community detection (Blondel, V. D., Guillaume, J.-L., Lambiotte, R. & Lefebvre, E. 2008. "Fast
 * unfolding of communities in large networks". Journal of Statistical Mechanics: Theory and Experiment
 * P10008), maximizing {@link modularity} at resolution γ.
 *
 * Each level runs a local-moving phase — nodes are visited in ascending order and each moves to the
 * neighbouring community with the largest modularity gain `k_i,C − γ k_i Σ_tot(C) / 2m` — until a pass moves
 * no node or improves modularity by at most `minPassGain`, then aggregates every community into a single node
 * (internal weight becomes a self-loop) and repeats on the aggregated graph until a level merges nothing.
 *
 * Deterministic tie-breaking: candidate communities are considered in ascending id; a node moves only when
 * the gain exceeds that of the best candidate so far by more than `minModularityGain`, so ties prefer the
 * current community, then the smallest id. Aggregated nodes are numbered by smallest member. Results are
 * therefore reproducible and, for integer weights, independent of edge input order (otherwise only up to
 * floating-point rounding when parallel edges are merged).
 *
 * Louvain can produce communities that are internally disconnected (Traag, V. A., Waltman, L. & van Eck, N.
 * J. 2019. "From Louvain to Leiden: guaranteeing well-connected communities". Scientific Reports 9:5233). A
 * final refinement therefore splits every community into the connected components of its induced subgraph,
 * which never decreases modularity. Communities are finally numbered 0..k − 1 by smallest member, and the
 * modularity of that final partition is reported.
 *
 * Complexity: O(n + m + Σ_i d_i log d_i) per pass (d_i = degree of node i, for sorting its candidate
 * communities); the number of passes and levels is small in practice and bounded by the options. O(n + m)
 * space.
 *
 * @throws GraphError on invalid options or a negative edge weight.
 */
export function louvain(graph: UndirectedGraph, options: LouvainOptions = {}): LouvainResult {
  const {
    resolution = 1,
    initialCommunities,
    maxLevels = Number.POSITIVE_INFINITY,
    maxPasses = 1000,
    minModularityGain = 1e-12,
    minPassGain = 1e-7,
  } = options;
  if (!Number.isFinite(resolution) || resolution < 0) {
    throw new GraphError(`resolution must be a finite number >= 0 (got ${resolution})`);
  }
  assertInteger(maxLevels, "maxLevels", 0, true);
  assertInteger(maxPasses, "maxPasses", 0, true);
  if (!(minModularityGain >= 0)) {
    throw new GraphError(`minModularityGain must be >= 0 (got ${minModularityGain})`);
  }
  if (!(minPassGain >= 0)) throw new GraphError(`minPassGain must be >= 0 (got ${minPassGain})`);
  const n = graph.nodeCount;
  for (const w of graph.weights) {
    if (w < 0) throw new GraphError(`Louvain requires non-negative edge weights (found ${w})`);
  }

  // The first level starts from the warm-start partition (relabelled densely) or from singletons.
  let start =
    initialCommunities === undefined ? undefined : relabel(n, initialCommunities).community;
  // membership[v]: the node of the current level that contains original node v.
  const membership = identity(n);
  let levels = 0;
  const m = graph.totalWeight;
  const twoM = 2 * m;
  if (twoM > 0) {
    let level = graph;
    while (levels < maxLevels) {
      const communities = start ?? identity(level.nodeCount);
      start = undefined;
      localMoving(
        level,
        communities,
        twoM,
        resolution,
        maxPasses,
        minModularityGain * m,
        minPassGain * m,
      );
      levels++;
      const { community, count } = relabel(level.nodeCount, communities);
      for (let v = 0; v < n; v++) membership[v] = community[membership[v]!]!;
      if (count === level.nodeCount) break;
      level = aggregate(level, community, count);
    }
    if (start !== undefined) membership.set(start); // maxLevels = 0
  } else if (start !== undefined) {
    // Without edge weight every partition has modularity 0: no move improves the warm start, which only
    // goes through the connected-component refinement below, like every partition.
    membership.set(start);
  }

  const { community: communities, count } = connectedRefinement(graph, membership);
  return {
    communities,
    count,
    modularity: modularityOf(graph, communities, count, resolution),
    levels,
  };
}

/** Dense relabelling 0..count − 1 by first appearance (i.e. by smallest member). */
function relabel(
  nodeCount: number,
  labels: ArrayLike<number>,
): { community: Int32Array; count: number } {
  if (labels.length !== nodeCount) {
    throw new GraphError(`Expected ${nodeCount} community labels, got ${labels.length}`);
  }
  const ids = new Map<number, number>();
  const community = new Int32Array(nodeCount);
  for (let v = 0; v < nodeCount; v++) {
    const labelValue = labels[v]!;
    if (!Number.isInteger(labelValue)) {
      throw new GraphError(`Community label of node ${v} is not an integer (got ${labelValue})`);
    }
    let id = ids.get(labelValue);
    if (id === undefined) {
      id = ids.size;
      ids.set(labelValue, id);
    }
    community[v] = id;
  }
  return { community, count: ids.size };
}

/** The labelling `0, 1, …, n − 1` (every node alone). */
function identity(n: number): Int32Array {
  const result = new Int32Array(n);
  for (let v = 0; v < n; v++) result[v] = v;
  return result;
}

/** Modularity of a dense labelling `community` (values 0..count − 1). */
function modularityOf(
  graph: UndirectedGraph,
  community: Int32Array,
  count: number,
  resolution: number,
): number {
  const twoM = 2 * graph.totalWeight;
  if (twoM === 0) return 0;
  const { offsets, neighbors, weights } = graph;
  const internal = new Float64Array(count);
  const total = new Float64Array(count);
  for (let i = 0; i < graph.nodeCount; i++) {
    const c = community[i]!;
    for (let e = offsets[i]!; e < offsets[i + 1]!; e++) {
      const j = neighbors[e]!;
      const w = weights[e]!;
      // A non-loop edge appears in both endpoint rows; a self-loop appears once but counts twice.
      const contribution = j === i ? 2 * w : w;
      total[c]! += contribution;
      if (community[j] === c) internal[c]! += contribution;
    }
  }
  let q = 0;
  for (let c = 0; c < count; c++) {
    const fraction = total[c]! / twoM;
    q += internal[c]! / twoM - resolution * fraction * fraction;
  }
  return q;
}

/**
 * Louvain local moving on `graph` from the partition `community` (ids < nodeCount), in place. Gains are
 * `k_i,C − γ k_i Σ_tot(C) / 2m`, i.e. m times the modularity change; `moveThreshold` and `passThreshold` are
 * in the same unit.
 */
function localMoving(
  graph: UndirectedGraph,
  community: Int32Array,
  twoM: number,
  resolution: number,
  maxPasses: number,
  moveThreshold: number,
  passThreshold: number,
): void {
  const n = graph.nodeCount;
  const { offsets, neighbors, weights } = graph;
  const strength = new Float64Array(n);
  const total = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let e = offsets[i]!; e < offsets[i + 1]!; e++) {
      k += neighbors[e] === i ? 2 * weights[e]! : weights[e]!;
    }
    strength[i] = k;
    total[community[i]!]! += k;
  }
  const linkWeight = new Float64Array(n);
  const seen = new Uint8Array(n);
  const candidates = new Int32Array(n);
  const factor = resolution / twoM;
  for (let pass = 0; pass < maxPasses; pass++) {
    let moved = false;
    let passGain = 0;
    for (let i = 0; i < n; i++) {
      const current = community[i]!;
      const k = strength[i]!;
      let candidateCount = 0;
      for (let e = offsets[i]!; e < offsets[i + 1]!; e++) {
        const j = neighbors[e]!;
        if (j === i) continue;
        const c = community[j]!;
        if (seen[c] === 0) {
          seen[c] = 1;
          candidates[candidateCount++] = c;
        }
        linkWeight[c]! += weights[e]!;
      }
      sortPrefix(candidates, candidateCount);
      total[current]! -= k;
      const stayGain = linkWeight[current]! - factor * k * total[current]!;
      let best = current;
      let bestGain = stayGain;
      for (let x = 0; x < candidateCount; x++) {
        const c = candidates[x]!;
        if (c === current) continue;
        const gain = linkWeight[c]! - factor * k * total[c]!;
        if (gain > bestGain + moveThreshold) {
          best = c;
          bestGain = gain;
        }
      }
      total[best]! += k;
      if (best !== current) {
        community[i] = best;
        moved = true;
        passGain += bestGain - stayGain;
      }
      for (let x = 0; x < candidateCount; x++) {
        const c = candidates[x]!;
        seen[c] = 0;
        linkWeight[c] = 0;
      }
    }
    // The gains of a pass's moves telescope to its modularity change (times m).
    if (!moved || passGain <= passThreshold) break;
  }
}

/** Sort `values[0 .. length)` ascending in place (insertion sort for the usual short candidate lists). */
function sortPrefix(values: Int32Array, length: number): void {
  if (length > 32) {
    values.subarray(0, length).sort();
    return;
  }
  for (let i = 1; i < length; i++) {
    const value = values[i]!;
    let j = i - 1;
    while (j >= 0 && values[j]! > value) {
      values[j + 1] = values[j]!;
      j--;
    }
    values[j + 1] = value;
  }
}

/** Collapse every community into one node; internal weight becomes a self-loop. */
function aggregate(graph: UndirectedGraph, community: Int32Array, count: number): UndirectedGraph {
  const { offsets, neighbors, weights } = graph;
  const sources: number[] = [];
  const targets: number[] = [];
  const sums: number[] = [];
  for (let i = 0; i < graph.nodeCount; i++) {
    const ci = community[i]!;
    for (let e = offsets[i]!; e < offsets[i + 1]!; e++) {
      const j = neighbors[e]!;
      if (j < i) continue; // each edge once: rows list non-loop edges twice
      const cj = community[j]!;
      sources.push(Math.min(ci, cj));
      targets.push(Math.max(ci, cj));
      sums.push(weights[e]!);
    }
  }
  return UndirectedGraph.fromEdges(count, sources, targets, sums);
}

/**
 * Split every community of `community` into the connected components of its induced subgraph, numbering the
 * resulting communities 0..k − 1 by smallest member.
 */
function connectedRefinement(
  graph: UndirectedGraph,
  community: Int32Array,
): { community: Int32Array; count: number } {
  const n = graph.nodeCount;
  const { offsets, neighbors } = graph;
  const result = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let next = 0;
  for (let root = 0; root < n; root++) {
    if (result[root] !== -1) continue;
    const id = next++;
    const c = community[root]!;
    result[root] = id;
    queue[0] = root;
    let tail = 1;
    for (let head = 0; head < tail; head++) {
      const v = queue[head]!;
      for (let e = offsets[v]!; e < offsets[v + 1]!; e++) {
        const w = neighbors[e]!;
        if (result[w] !== -1 || community[w] !== c) continue;
        result[w] = id;
        queue[tail++] = w;
      }
    }
  }
  return { community: result, count: next };
}
