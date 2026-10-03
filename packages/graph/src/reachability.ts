/**
 * Transitive reachability counts (how many nodes each node can reach, or be reached from) and the
 * propagation cost metric built on them.
 */

import { topologicalOrder } from "./dag.js";
import { GraphError } from "./digraph.js";
import type { Digraph } from "./digraph.js";
import { assertInteger } from "./internal.js";
import { createRandom } from "./random.js";
import { condensation, stronglyConnectedComponents } from "./scc.js";
import type { Direction } from "./traversal.js";

/** Options of {@link reachabilityCounts}. */
export interface ReachabilityOptions {
  /**
   * Largest condensation (number of strongly connected components) for which counts are computed exactly;
   * larger graphs are estimated. Exact counting needs up to c²/8 bytes of bitsets for c components.
   * Default 20 000 (at most 50 MB).
   */
  maxExactNodes?: number;
  /** Number of independent ranks per node used by the estimator (k ≥ 2, default 64). */
  sketchSize?: number;
  /** Seed of the estimator's random ranks (default 1). */
  seed?: number;
}

/** Result of {@link reachabilityCounts}. */
export interface ReachabilityCounts {
  /** For every node, the number of other nodes it reaches (excluding itself). Estimates are not rounded. */
  readonly counts: Float64Array;
  /** Whether `counts` are exact (true) or estimated (false). */
  readonly exact: boolean;
}

const DEFAULT_MAX_EXACT_NODES = 20_000;
const DEFAULT_SKETCH_SIZE = 64;
const DEFAULT_SEED = 1;

/**
 * For every node, the number of **other** nodes reachable from it by following `direction` (`"out"`: what a
 * node transitively depends on; `"in"`: what transitively depends on it). Members of a strongly connected
 * component reach one another, so a node always counts the other members of its own component.
 *
 * **Exact method** (condensation with at most `maxExactNodes` components): the graph is condensed into its
 * component DAG, and reachable sets are built as bitsets (`Uint32Array` words) in reverse topological order,
 * each component's set being its own bit united with the sets of its successors (the classic
 * transitive-closure scheme; Purdom, P. 1970. "A transitive closure algorithm". BIT Numerical Mathematics
 * 10(1):76–94). Bits are indexed by topological position, so a union only touches the words at or after the
 * successor's position, and a set is released as soon as all its readers are done. Time O((c + m_c)·c/32) for
 * c components and m_c condensation edges; memory O(c²/32) words in the worst case.
 *
 * **Estimated method** (larger condensations): Cohen's size-estimation framework (Cohen, E. 1997.
 * "Size-estimation framework with applications to transitive closure and reachability". Journal of Computer
 * and System Sciences 55(3):441–453). Every component receives k independent exponentially distributed random
 * ranks with rate equal to its size; for each of the k rank slots, the minimum rank over everything reachable
 * is propagated in reverse topological order over the condensation (O(k·(c + m_c)) time, O(c) memory per
 * batch of slots). The minimum of exponential ranks over a set S is exponential with rate |S|, so for the
 * union S of the sets reachable from a component's successors, `(k − 1) / Σ minima` is an unbiased estimator
 * of |S| with coefficient of variation 1/√(k − 2): a relative standard error of about 12.7 % for the default
 * k = 64 (roughly 95 % of estimates within ±25 %). The count of a node is then the exact number of other
 * members of its own component plus that estimate, clamped to the exact bounds [Σ sizes of direct successor
 * components, Σ sizes of components after it in topological order]; clamping never moves an estimate away
 * from the truth. Nodes whose component has no successors are always exact.
 *
 * Both methods first build the condensation (O(n + m log m) time, see {@link condensation}).
 *
 * Determinism: exact counts depend only on the graph; estimates depend only on the graph and `seed`
 * (mulberry32, see {@link createRandom}).
 *
 * @throws GraphError on invalid options or direction.
 */
export function reachabilityCounts(
  graph: Digraph,
  direction: Direction,
  options: ReachabilityOptions = {},
): ReachabilityCounts {
  const {
    maxExactNodes = DEFAULT_MAX_EXACT_NODES,
    sketchSize = DEFAULT_SKETCH_SIZE,
    seed = DEFAULT_SEED,
  } = options;
  assertInteger(maxExactNodes, "maxExactNodes", 0, true);
  assertInteger(sketchSize, "sketchSize", 2);
  if (!Number.isSafeInteger(seed))
    throw new GraphError(`seed must be a safe integer (got ${seed})`);

  const scc = stronglyConnectedComponents(graph);
  let dag = condensation(graph, scc);
  switch (direction) {
    case "out":
      break;
    case "in":
      dag = dag.reverse();
      break;
    default:
      throw new GraphError(`Unknown direction ${String(direction)}`);
  }
  const sizes = new Int32Array(scc.count);
  for (let id = 0; id < scc.count; id++) sizes[id] = scc.components[id]!.length;
  const exact = scc.count <= maxExactNodes;
  const perComponent = exact
    ? exactComponentCounts(dag, sizes)
    : estimatedComponentCounts(dag, sizes, sketchSize, seed);
  const counts = new Float64Array(graph.nodeCount);
  for (let v = 0; v < graph.nodeCount; v++) counts[v] = perComponent[scc.componentOf[v]!]!;
  return { counts, exact };
}

/**
 * Propagation cost (MacCormack, A., Rusnak, J. & Baldwin, C. Y. 2006. "Exploring the structure of complex
 * software designs: an empirical study of open source and proprietary code". Management Science
 * 52(7):1015–1030): the density of the visibility matrix — the transitive closure including self-visibility —
 * i.e. `Σ_v (reach(v) + 1) / n²`, the average fraction of the system a change to one node can affect. 0 for
 * the empty graph; 1/n for n isolated nodes; 1 when every node reaches every other.
 *
 * Counts come from {@link reachabilityCounts} (`"out"`; the sum is the same in both directions) with
 * `options`: exact whenever the condensation has at most `maxExactNodes` components, otherwise estimated.
 *
 * Complexity and determinism: those of {@link reachabilityCounts}.
 */
export function propagationCost(graph: Digraph, options: ReachabilityOptions = {}): number {
  const n = graph.nodeCount;
  if (n === 0) return 0;
  const { counts } = reachabilityCounts(graph, "out", options);
  let visible = n;
  for (let v = 0; v < n; v++) visible += counts[v]!;
  return visible / (n * n);
}

/** Number of set bits of a 32-bit word (Hacker's Delight, §5-1). */
function popcount(word: number): number {
  let x = word - ((word >>> 1) & 0x55555555);
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

/** Exact number of other nodes reachable from each component of a condensation (see reachabilityCounts). */
function exactComponentCounts(dag: Digraph, sizes: Int32Array): Float64Array {
  const c = dag.nodeCount;
  const { outOffsets: offsets, outTargets: targets, inOffsets } = dag;
  const order = topologicalOrder(dag);
  const position = new Int32Array(c);
  for (let k = 0; k < c; k++) position[order[k]!] = k;
  const words = (c + 31) >>> 5;
  // Bit p stands for the component at topological position p. Components of more than one node are flagged in
  // `big`, so that a count is popcount + Σ (size − 1) over the (usually few) big components in the set.
  const big = new Uint32Array(words);
  let hasBig = false;
  for (let k = 0; k < c; k++) {
    if (sizes[order[k]!]! > 1) {
      big[k >>> 5]! |= 1 << (k & 31);
      hasBig = true;
    }
  }
  const readers = new Int32Array(c);
  for (let id = 0; id < c; id++) readers[id] = inOffsets[id + 1]! - inOffsets[id]!;
  const sets = new Array<Uint32Array | undefined>(c);
  const pool: Uint32Array[] = [];
  const result = new Float64Array(c);
  for (let k = c - 1; k >= 0; k--) {
    const id = order[k]!;
    const set = pool.pop()?.fill(0) ?? new Uint32Array(words);
    const first = k >>> 5;
    set[first]! |= 1 << (k & 31);
    for (let i = offsets[id]!; i < offsets[id + 1]!; i++) {
      const successor = targets[i]!;
      const other = sets[successor]!;
      for (let w = position[successor]! >>> 5; w < words; w++) set[w]! |= other[w]!;
      if (--readers[successor]! === 0) {
        pool.push(other);
        sets[successor] = undefined;
      }
    }
    let total = 0;
    for (let w = first; w < words; w++) total += popcount(set[w]!);
    if (hasBig) {
      for (let w = first; w < words; w++) {
        let bits = set[w]! & big[w]!;
        while (bits !== 0) {
          const lowest = bits & -bits;
          total += sizes[order[(w << 5) | (31 - Math.clz32(lowest))]!]! - 1;
          bits ^= lowest;
        }
      }
    }
    result[id] = total - 1;
    if (readers[id]! > 0) sets[id] = set;
    else pool.push(set);
  }
  return result;
}

/** Cohen's estimate of the number of other nodes reachable from each component (see reachabilityCounts). */
function estimatedComponentCounts(
  dag: Digraph,
  sizes: Int32Array,
  sketchSize: number,
  seed: number,
): Float64Array {
  const c = dag.nodeCount;
  const { outOffsets: offsets, outTargets: targets } = dag;
  const order = topologicalOrder(dag);
  const random = createRandom(seed);
  // Rank slots are processed in batches: memory O(c · batch), adjacency scanned once per batch.
  const batch = Math.min(sketchSize, 8);
  const minima = new Float64Array(c * batch);
  const below = new Float64Array(batch);
  const sumOfMinima = new Float64Array(c);
  for (let firstSlot = 0; firstSlot < sketchSize; firstSlot += batch) {
    const width = Math.min(batch, sketchSize - firstSlot);
    for (let k = c - 1; k >= 0; k--) {
      const id = order[k]!;
      const start = offsets[id]!;
      const end = offsets[id + 1]!;
      below.fill(Number.POSITIVE_INFINITY);
      for (let i = start; i < end; i++) {
        const base = targets[i]! * batch;
        for (let b = 0; b < width; b++) {
          const candidate = minima[base + b]!;
          if (candidate < below[b]!) below[b] = candidate;
        }
      }
      const size = sizes[id]!;
      const base = id * batch;
      for (let b = 0; b < width; b++) {
        if (end > start) sumOfMinima[id]! += below[b]!;
        const rank = -Math.log(1 - random()) / size;
        minima[base + b] = rank < below[b]! ? rank : below[b]!;
      }
    }
  }
  // Exact bounds: direct successors are certainly reachable; nothing before a component in topological order
  // is reachable from it.
  const after = new Float64Array(c + 1);
  for (let k = c - 1; k >= 0; k--) after[k] = after[k + 1]! + sizes[order[k]!]!;
  const result = new Float64Array(c);
  for (let k = 0; k < c; k++) {
    const id = order[k]!;
    const own = sizes[id]! - 1;
    const start = offsets[id]!;
    const end = offsets[id + 1]!;
    if (start === end) {
      result[id] = own;
      continue;
    }
    let lower = 0;
    for (let i = start; i < end; i++) lower += sizes[targets[i]!]!;
    const upper = after[k + 1]!;
    const estimate = (sketchSize - 1) / sumOfMinima[id]!;
    result[id] = own + Math.min(Math.max(estimate, lower), upper);
  }
  return result;
}
