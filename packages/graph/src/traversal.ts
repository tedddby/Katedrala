/**
 * Breadth-first traversal, reachability and unweighted shortest paths on a {@link Digraph}.
 *
 * All traversals are iterative (explicit queues and stacks), so paths of any length are safe, and
 * deterministic: sources are processed in ascending order and adjacency rows are sorted, so the visiting
 * order, the distances and the shortest-path tree are pure functions of the graph and the source set.
 */

import type { Digraph } from "./digraph.js";
import { adjacency, assertInteger, assertNodeIndex, sortedUniqueNodes } from "./internal.js";

/**
 * Which edges a traversal follows. `"out"` follows edges from source to target (in a dependency graph: what a
 * node depends on); `"in"` follows them backwards (what depends on a node).
 */
export type Direction = "out" | "in";

/** Options of {@link bfs}. */
export interface BfsOptions {
  /** Edges to follow (default `"out"`). */
  direction?: Direction;
  /**
   * Do not expand nodes at this distance from the sources: nodes farther away are left unreached. A
   * non-negative integer or `Infinity` (the default).
   */
  maxDepth?: number;
}

/** Result of {@link bfs}. */
export interface BfsResult {
  /** Reached nodes in visiting order (sources first, ascending; then by distance). */
  readonly order: Int32Array;
  /** Number of edges on a shortest path from the nearest source; -1 for unreached nodes. */
  readonly distance: Int32Array;
  /**
   * Predecessor of each reached node in the breadth-first tree (the first node, in visiting order, through
   * which it was reached); -1 for sources and unreached nodes.
   */
  readonly parent: Int32Array;
}

/**
 * Multi-source breadth-first search (Moore, E. F. 1959. "The shortest path through a maze". Proceedings of
 * the International Symposium on the Theory of Switching, 285–292).
 *
 * Sources are de-duplicated and enqueued in ascending order, and neighbours are scanned in ascending order,
 * so the result — in particular the shortest-path tree in `parent` — is deterministic.
 *
 * Complexity: O(n + m) time and O(n) space.
 *
 * @throws GraphError if a source is not a node or `maxDepth` is invalid.
 */
export function bfs(
  graph: Digraph,
  sources: Iterable<number>,
  options: BfsOptions = {},
): BfsResult {
  const { direction = "out", maxDepth = Number.POSITIVE_INFINITY } = options;
  assertInteger(maxDepth, "maxDepth", 0, true);
  const { offsets, targets } = adjacency(graph, direction);
  const n = graph.nodeCount;
  const start = sortedUniqueNodes(n, sources, "Source");
  const distance = new Int32Array(n).fill(-1);
  const parent = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let tail = 0;
  for (const source of start) {
    distance[source] = 0;
    queue[tail++] = source;
  }
  for (let head = 0; head < tail; head++) {
    const v = queue[head]!;
    const next = distance[v]! + 1;
    if (next > maxDepth) continue;
    for (let i = offsets[v]!; i < offsets[v + 1]!; i++) {
      const w = targets[i]!;
      if (distance[w] !== -1) continue;
      distance[w] = next;
      parent[w] = v;
      queue[tail++] = w;
    }
  }
  return { order: queue.slice(0, tail), distance, parent };
}

/**
 * The set of nodes reachable from `sources` (sources included) by following `direction`, as a mask with 1 for
 * reachable nodes.
 *
 * Iterative graph search with an explicit stack (Tarjan, R. E. 1972. "Depth-first search and linear graph
 * algorithms". SIAM Journal on Computing 1(2):146–160), so it is safe on arbitrarily long paths.
 *
 * Complexity: O(n + m) time and O(n) space. Determinism: the result is a set; it does not depend on any
 * order.
 *
 * @throws GraphError if a source is not a node.
 */
export function reachableFrom(
  graph: Digraph,
  sources: Iterable<number>,
  direction: Direction = "out",
): Uint8Array {
  const { offsets, targets } = adjacency(graph, direction);
  const n = graph.nodeCount;
  const reached = new Uint8Array(n);
  const stack = new Int32Array(n);
  let size = 0;
  for (const source of sources) {
    assertNodeIndex(n, source, "Source");
    if (reached[source] === 1) continue;
    reached[source] = 1;
    stack[size++] = source;
  }
  while (size > 0) {
    const v = stack[--size]!;
    for (let i = offsets[v]!; i < offsets[v + 1]!; i++) {
      const w = targets[i]!;
      if (reached[w] === 1) continue;
      reached[w] = 1;
      stack[size++] = w;
    }
  }
  return reached;
}

/**
 * A shortest (fewest edges) path from `source` to `target` following `direction`, as the node sequence
 * including both ends, or `undefined` when `target` is unreachable. With `direction = "in"` the sequence
 * walks edges backwards: each node is a predecessor of the previous one.
 *
 * Breadth-first search (Moore, E. F. 1959. "The shortest path through a maze". Proceedings of the
 * International Symposium on the Theory of Switching, 285–292). Among several shortest paths, the one in the
 * breadth-first tree of {@link bfs} is returned, so the result is deterministic. `shortestPath(g, v, v)` is
 * `[v]`.
 *
 * Complexity: O(n + m) time (the search stops when `target` is reached) and O(n) space.
 *
 * @throws GraphError if `source` or `target` is not a node.
 */
export function shortestPath(
  graph: Digraph,
  source: number,
  target: number,
  direction: Direction = "out",
): number[] | undefined {
  const n = graph.nodeCount;
  assertNodeIndex(n, source, "Source");
  assertNodeIndex(n, target, "Target");
  if (source === target) return [source];
  const { offsets, targets } = adjacency(graph, direction);
  const parent = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  parent[source] = source;
  queue[0] = source;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const v = queue[head]!;
    for (let i = offsets[v]!; i < offsets[v + 1]!; i++) {
      const w = targets[i]!;
      if (parent[w] !== -1) continue;
      parent[w] = v;
      if (w === target) {
        const path = [target];
        for (let x = v; x !== source; x = parent[x]!) path.push(x);
        path.push(source);
        return path.reverse();
      }
      queue[tail++] = w;
    }
  }
  return undefined;
}
