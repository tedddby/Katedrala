/**
 * Betweenness centrality: how often a node lies on shortest paths between other nodes.
 */

import { GraphError } from "./digraph.js";
import type { Digraph } from "./digraph.js";
import { assertInteger } from "./internal.js";
import { createRandom, sampleWithoutReplacement } from "./random.js";

/** Options of {@link betweennessCentrality}. */
export interface BetweennessOptions {
  /**
   * Divide by (n − 1)(n − 2), the number of ordered pairs of other nodes, so values lie in [0, 1]
   * (default `true`). Graphs with at most two nodes have all values 0.
   */
  normalized?: boolean;
  /**
   * Estimate from `pivots` source nodes drawn without replacement with the seeded generator of
   * {@link createRandom}, instead of from all n sources. `pivots >= n` computes the exact values.
   */
  sample?: { pivots: number; seed: number };
}

/** Result of {@link betweennessCentrality}. */
export interface BetweennessResult {
  /** Betweenness of every node. */
  readonly values: Float64Array;
  /** Whether `values` are exact (all sources used) or estimated from sampled pivots. */
  readonly exact: boolean;
}

/**
 * Shortest-path counts up to this bound are used as they are, which keeps the coefficients
 * `(1 + δ(w)) / σ(w)` of the dependency accumulation normal floating-point numbers. Counts beyond about
 * 2^1022 would make them subnormal (losing precision), and counts beyond about 1.8e308 overflow to
 * `Infinity` (turning values into NaN), so a source with a larger count is recomputed in log space instead.
 */
const MAX_PATH_COUNT = 2 ** 1000;

/**
 * Natural logarithms of the shortest-path counts from `order[0]` to the nodes `order[0 .. reached)` (breadth-
 * first order, distances in `distance`), level by level: log σ(w) is the log-sum-exp of log σ(v) over the
 * in-edges v → w from the previous level (parallel edges counted separately, as in the linear counts).
 */
function logPathCounts(
  order: Int32Array,
  reached: number,
  distance: Int32Array,
  inOffsets: Int32Array,
  inSources: Int32Array,
  logPaths: Float64Array,
): void {
  logPaths[order[0]!] = 0;
  for (let j = 1; j < reached; j++) {
    const w = order[j]!;
    const previous = distance[w]! - 1;
    let max = Number.NEGATIVE_INFINITY;
    for (let i = inOffsets[w]!; i < inOffsets[w + 1]!; i++) {
      const v = inSources[i]!;
      if (distance[v] === previous && logPaths[v]! > max) max = logPaths[v]!;
    }
    let sum = 0;
    for (let i = inOffsets[w]!; i < inOffsets[w + 1]!; i++) {
      const v = inSources[i]!;
      if (distance[v] === previous) sum += Math.exp(logPaths[v]! - max);
    }
    logPaths[w] = max + Math.log(sum);
  }
}

/**
 * Directed, unweighted betweenness centrality: for every node v, the sum over ordered pairs (s, t) of other
 * nodes of the fraction of shortest s→t paths that pass through v (Freeman, L. C. 1977. "A set of measures of
 * centrality based on betweenness". Sociometry 40(1):35–41).
 *
 * Computed with Brandes' algorithm (Brandes, U. 2001. "A faster algorithm for betweenness centrality".
 * Journal of Mathematical Sociology 25(2):163–177): one breadth-first search per source counts shortest
 * paths, and dependencies are accumulated in reverse breadth-first order. Edge weights are ignored;
 * self-loops never lie on shortest paths; parallel edges (graphs built without merging) count as distinct
 * paths.
 *
 * Shortest-path counts grow exponentially with the depth of layered graphs and can exceed the floating-point
 * range: in 1030 layers of two nodes, each joined to both nodes of the next layer, 2^1028 shortest paths
 * lead from a node of the first layer to a node of the last. A source with a count above 2^1000 is therefore
 * recomputed with the counts' logarithms (log-sum-exp per node), and its dependencies use the ratios
 * σ(v) / σ(w) = exp(log σ(v) − log σ(w)) <= 1, so values stay finite and accurate; all other sources use the
 * counts as they are.
 *
 * With `sample`, dependencies are accumulated from `pivots` uniformly chosen sources only and scaled by
 * n / pivots, an unbiased estimator (Brandes, U. & Pich, C. 2007. "Centrality estimation in large networks".
 * International Journal of Bifurcation and Chaos 17(7):2303–2318).
 *
 * Complexity: O(n·m) time exact, O(pivots·m) sampled; O(n + m) space. Determinism: sources are processed in
 * ascending order and pivots depend only on the seed, so results are bit-for-bit reproducible.
 *
 * @throws GraphError on invalid sampling options.
 */
export function betweennessCentrality(
  graph: Digraph,
  options: BetweennessOptions = {},
): BetweennessResult {
  const { normalized = true, sample } = options;
  const n = graph.nodeCount;
  let pivots: Int32Array | null = null;
  if (sample !== undefined) {
    assertInteger(sample.pivots, "sample.pivots", 1);
    if (!Number.isSafeInteger(sample.seed)) {
      throw new GraphError(`sample.seed must be a safe integer (got ${sample.seed})`);
    }
    if (sample.pivots < n)
      pivots = sampleWithoutReplacement(n, sample.pivots, createRandom(sample.seed));
  }
  const values = new Float64Array(n);
  const { outOffsets, outTargets, inOffsets, inSources } = graph;
  const distance = new Int32Array(n).fill(-1);
  const paths = new Float64Array(n);
  const dependency = new Float64Array(n);
  const order = new Int32Array(n);
  let logPaths: Float64Array | undefined;
  const sourceCount = pivots === null ? n : pivots.length;
  for (let k = 0; k < sourceCount; k++) {
    const s = pivots === null ? k : pivots[k]!;
    distance[s] = 0;
    paths[s] = 1;
    order[0] = s;
    let tail = 1;
    let tooMany = false;
    for (let head = 0; head < tail; head++) {
      const v = order[head]!;
      const next = distance[v]! + 1;
      const pathsToV = paths[v]!;
      if (pathsToV > MAX_PATH_COUNT) tooMany = true;
      for (let i = outOffsets[v]!; i < outOffsets[v + 1]!; i++) {
        const w = outTargets[i]!;
        if (distance[w] === -1) {
          distance[w] = next;
          order[tail++] = w;
        }
        if (distance[w] === next) paths[w]! += pathsToV;
      }
    }
    // Accumulate dependencies in reverse breadth-first order; predecessors on shortest paths are the
    // in-neighbours one level closer to the source.
    if (tooMany) {
      logPaths ??= new Float64Array(n);
      logPathCounts(order, tail, distance, inOffsets, inSources, logPaths);
      for (let j = tail - 1; j > 0; j--) {
        const w = order[j]!;
        const previous = distance[w]! - 1;
        const share = 1 + dependency[w]!;
        const logPathsToW = logPaths[w]!;
        for (let i = inOffsets[w]!; i < inOffsets[w + 1]!; i++) {
          const v = inSources[i]!;
          if (distance[v] === previous) {
            dependency[v]! += Math.exp(logPaths[v]! - logPathsToW) * share;
          }
        }
        values[w]! += dependency[w]!;
      }
    } else {
      for (let j = tail - 1; j > 0; j--) {
        const w = order[j]!;
        const previous = distance[w]! - 1;
        const coefficient = (1 + dependency[w]!) / paths[w]!;
        for (let i = inOffsets[w]!; i < inOffsets[w + 1]!; i++) {
          const v = inSources[i]!;
          if (distance[v] === previous) dependency[v]! += paths[v]! * coefficient;
        }
        values[w]! += dependency[w]!;
      }
    }
    for (let j = 0; j < tail; j++) {
      const v = order[j]!;
      distance[v] = -1;
      paths[v] = 0;
      dependency[v] = 0;
    }
  }
  let scale = pivots === null ? 1 : n / pivots.length;
  if (normalized) scale = n > 2 ? scale / ((n - 1) * (n - 2)) : 0;
  if (scale !== 1) for (let v = 0; v < n; v++) values[v]! *= scale;
  return { values, exact: pivots === null };
}
