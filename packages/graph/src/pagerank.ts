/**
 * PageRank: the stationary distribution of a random walk that follows edges and occasionally teleports.
 */

import { GraphError } from "./digraph.js";
import type { Digraph } from "./digraph.js";
import { assertInteger } from "./internal.js";

/** Options of {@link pageRank}. */
export interface PageRankOptions {
  /** Probability of following an edge rather than teleporting, in [0, 1] (default 0.85). */
  damping?: number;
  /** Stop when the L1 distance between successive iterates falls below this value (default 1e-10). */
  tolerance?: number;
  /** Upper bound on the number of power iterations (default 1000). */
  maxIterations?: number;
  /**
   * Split a node's rank among its out-edges in proportion to their weights instead of equally (default
   * `false`). Weights must then be non-negative; nodes whose out-edges all weigh 0 count as dangling.
   */
  weighted?: boolean;
}

/** Result of {@link pageRank}. */
export interface PageRankResult {
  /** PageRank of every node; the values sum to 1 (for a non-empty graph). */
  readonly values: Float64Array;
  /** Number of power iterations performed. */
  readonly iterations: number;
  /** Whether the tolerance was reached within `maxIterations`. */
  readonly converged: boolean;
}

/**
 * PageRank (Page, L., Brin, S., Motwani, R. & Winograd, T. 1999. "The PageRank citation ranking: bringing
 * order to the Web". Stanford InfoLab technical report 1999-66) by power iteration:
 *
 * `x'[v] = (1 − d)/n + d · (Σ_{u→v} x[u] · w(u→v)/W(u) + Σ_{u dangling} x[u]/n)`
 *
 * where W(u) is the out-degree of u (or its total out-weight when `weighted`) and dangling nodes (W(u) = 0)
 * spread their rank uniformly over all nodes. Self-loops count as ordinary out-edges. Rank flows along
 * out-edges — from a user to what it uses — so in a dependency graph heavily depended-upon nodes rank high,
 * as in ComponentRank (Inoue, K., Yokomori, R., Fujiwara, H., Yamamoto, T., Matsushita, M. & Kusumoto, S.
 * 2005. "Ranking significance of software components based on use relations". IEEE Transactions on Software
 * Engineering 31(3):213–225).
 *
 * The iteration starts from the uniform vector and stops when the L1 change drops below `tolerance` (the
 * error then is at most tolerance·d/(1 − d)) or after `maxIterations`. The result is renormalized to sum to
 * 1.
 *
 * Complexity: O((n + m) · iterations) time, O(n) extra space. Determinism: sums run in ascending node and
 * edge order, so results are bit-for-bit reproducible.
 *
 * @throws GraphError on invalid options, or on a negative edge weight when `weighted`.
 */
export function pageRank(graph: Digraph, options: PageRankOptions = {}): PageRankResult {
  const { damping = 0.85, tolerance = 1e-10, maxIterations = 1000, weighted = false } = options;
  if (!(damping >= 0 && damping <= 1))
    throw new GraphError(`damping must be in [0, 1] (got ${damping})`);
  if (!(tolerance >= 0)) throw new GraphError(`tolerance must be >= 0 (got ${tolerance})`);
  assertInteger(maxIterations, "maxIterations", 0);
  const n = graph.nodeCount;
  if (n === 0) return { values: new Float64Array(0), iterations: 0, converged: true };

  const { outOffsets, outWeights, inOffsets, inSources, inWeights } = graph;
  // inverse[u] = 1 / W(u), or 0 for dangling nodes.
  const inverse = new Float64Array(n);
  const dangling: number[] = [];
  for (let u = 0; u < n; u++) {
    let total = 0;
    if (weighted) {
      for (let i = outOffsets[u]!; i < outOffsets[u + 1]!; i++) {
        const w = outWeights[i]!;
        if (w < 0) throw new GraphError(`Edge weight ${w} of node ${u} is negative`);
        total += w;
      }
    } else {
      total = outOffsets[u + 1]! - outOffsets[u]!;
    }
    if (total > 0) inverse[u] = 1 / total;
    else dangling.push(u);
  }

  let rank = new Float64Array(n).fill(1 / n);
  let next = new Float64Array(n);
  const share = new Float64Array(n);
  const teleport = (1 - damping) / n;
  let iterations = 0;
  let converged = false;
  while (iterations < maxIterations) {
    iterations++;
    let danglingRank = 0;
    for (const u of dangling) danglingRank += rank[u]!;
    for (let u = 0; u < n; u++) share[u] = rank[u]! * inverse[u]!;
    const base = teleport + (damping * danglingRank) / n;
    let change = 0;
    for (let v = 0; v < n; v++) {
      let incoming = 0;
      if (weighted) {
        for (let i = inOffsets[v]!; i < inOffsets[v + 1]!; i++)
          incoming += share[inSources[i]!]! * inWeights[i]!;
      } else {
        for (let i = inOffsets[v]!; i < inOffsets[v + 1]!; i++) incoming += share[inSources[i]!]!;
      }
      const value = base + damping * incoming;
      change += Math.abs(value - rank[v]!);
      next[v] = value;
    }
    [rank, next] = [next, rank];
    if (change < tolerance) {
      converged = true;
      break;
    }
  }
  let sum = 0;
  for (let v = 0; v < n; v++) sum += rank[v]!;
  for (let v = 0; v < n; v++) rank[v]! /= sum;
  return { values: rank, iterations, converged };
}
