/**
 * Algorithms on directed acyclic graphs: canonical topological order and longest-path depths.
 */

import { GraphError } from "./digraph.js";
import type { Digraph } from "./digraph.js";
import { IntMinHeap, adjacency } from "./internal.js";
import type { Direction } from "./traversal.js";

/**
 * The topological order of a DAG that is lexicographically smallest: Kahn's algorithm (Kahn, A. B. 1962.
 * "Topological sorting of large networks". Communications of the ACM 5(11):558–562) where, among all nodes
 * whose predecessors have been emitted, the smallest is emitted next (a binary min-heap holds the
 * candidates). The order is therefore unique for a given graph, independent of how it was built.
 *
 * Complexity: O(m + n log n) time, O(n) space.
 *
 * @throws GraphError if the graph has a cycle (including a self-loop).
 */
export function topologicalOrder(dag: Digraph): Int32Array {
  const n = dag.nodeCount;
  const { outOffsets: offsets, outTargets: targets, inOffsets } = dag;
  const pending = new Int32Array(n);
  const heap = new IntMinHeap(n);
  for (let v = 0; v < n; v++) {
    pending[v] = inOffsets[v + 1]! - inOffsets[v]!;
    if (pending[v] === 0) heap.push(v);
  }
  const order = new Int32Array(n);
  let size = 0;
  while (heap.size > 0) {
    const v = heap.pop();
    order[size++] = v;
    for (let i = offsets[v]!; i < offsets[v + 1]!; i++) {
      const w = targets[i]!;
      if (--pending[w]! === 0) heap.push(w);
    }
  }
  if (size < n) {
    let first = 0;
    while (pending[first] === 0) first++;
    throw new GraphError(
      `Graph is not acyclic: ${n - size} nodes lie on or behind a cycle (the smallest is ${first})`,
    );
  }
  return order;
}

/**
 * For every node of a DAG, the number of edges on the longest path that starts at it and follows `direction`.
 * With `"out"` (the default) this is the depth of a node's dependency chain (0 for sinks); with `"in"` it is
 * the length of the longest path ending at the node in the original graph (0 for sources).
 *
 * Dynamic programming over {@link topologicalOrder} (Cormen, T. H., Leiserson, C. E., Rivest, R. L. & Stein,
 * C. 2009. "Introduction to Algorithms", 3rd ed., §24.2 and problem 15-1, MIT Press). Determinism: the result
 * is a pure function of the graph.
 *
 * Complexity: O(m + n log n) time, O(n) space.
 *
 * @throws GraphError if the graph has a cycle.
 */
export function longestPathLengths(dag: Digraph, direction: Direction = "out"): Int32Array {
  const { offsets, targets } = adjacency(dag, direction);
  const order = topologicalOrder(dag);
  const n = dag.nodeCount;
  const length = new Int32Array(n);
  // Following "out", a node's value depends on its successors, which come later in topological order;
  // following "in", on its predecessors, which come earlier.
  const forward = direction === "in";
  for (let k = 0; k < n; k++) {
    const v = order[forward ? k : n - 1 - k]!;
    let best = 0;
    for (let i = offsets[v]!; i < offsets[v + 1]!; i++) {
      const candidate = length[targets[i]!]! + 1;
      if (candidate > best) best = candidate;
    }
    length[v] = best;
  }
  return length;
}
