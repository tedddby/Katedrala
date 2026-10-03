/**
 * Building blocks shared by the algorithm modules: argument validation, direction-aware adjacency, binary
 * heaps and the iterative Tarjan kernel. Nothing in this module is exported from `index.ts`; it is not part
 * of the public API and may change without notice.
 *
 * @internal
 */

import { GraphError } from "./digraph.js";
import type { Digraph } from "./digraph.js";
import type { Direction } from "./traversal.js";

/**
 * Throw a {@link GraphError} unless `node` is an integer in `[0, nodeCount)`.
 *
 * @internal
 */
export function assertNodeIndex(nodeCount: number, node: number, what = "Node"): void {
  if (!Number.isInteger(node) || node < 0 || node >= nodeCount) {
    throw new GraphError(`${what} ${node} is not a node of a graph with ${nodeCount} nodes`);
  }
}

/**
 * Throw a {@link GraphError} unless `value` is an integer `>= min` (or `+Infinity` when `allowInfinity`).
 *
 * @internal
 */
export function assertInteger(
  value: number,
  name: string,
  min: number,
  allowInfinity = false,
): void {
  if (allowInfinity && value === Number.POSITIVE_INFINITY) return;
  if (!Number.isInteger(value) || value < min) {
    const bound = allowInfinity ? " or Infinity" : "";
    throw new GraphError(`${name} must be an integer >= ${min}${bound} (got ${value})`);
  }
}

/**
 * One direction of a {@link Digraph} as CSR arrays: the neighbours of `v` are
 * `targets[offsets[v] .. offsets[v + 1])`, sorted ascending.
 *
 * @internal
 */
export interface Adjacency {
  readonly offsets: Int32Array;
  readonly targets: Int32Array;
  readonly weights: Float64Array;
}

/**
 * The adjacency followed by `direction`: `"out"` follows edges source → target, `"in"` target → source.
 *
 * @internal
 */
export function adjacency(graph: Digraph, direction: Direction): Adjacency {
  switch (direction) {
    case "out":
      return { offsets: graph.outOffsets, targets: graph.outTargets, weights: graph.outWeights };
    case "in":
      return { offsets: graph.inOffsets, targets: graph.inSources, weights: graph.inWeights };
    default:
      throw new GraphError(`Unknown direction ${String(direction)}`);
  }
}

/**
 * Collect `nodes` into a sorted, duplicate-free array, validating every entry.
 *
 * Complexity: O(nodeCount + |nodes|).
 *
 * @internal
 */
export function sortedUniqueNodes(
  nodeCount: number,
  nodes: Iterable<number>,
  what: string,
): Int32Array {
  const seen = new Uint8Array(nodeCount);
  let count = 0;
  for (const node of nodes) {
    assertNodeIndex(nodeCount, node, what);
    if (seen[node] === 0) {
      seen[node] = 1;
      count++;
    }
  }
  const result = new Int32Array(count);
  let k = 0;
  for (let v = 0; v < nodeCount && k < count; v++) if (seen[v] === 1) result[k++] = v;
  return result;
}

/**
 * A binary min-heap of 32-bit integers (Williams, J. W. J. 1964. "Algorithm 232: Heapsort". Communications
 * of the ACM 7(6):347–348). Grows on demand. Push and pop are O(log size).
 *
 * @internal
 */
export class IntMinHeap {
  private items: Int32Array;
  private count = 0;

  constructor(capacity = 16) {
    this.items = new Int32Array(Math.max(capacity, 1));
  }

  /** Number of stored items. */
  get size(): number {
    return this.count;
  }

  /** Add `value`. */
  push(value: number): void {
    if (this.count === this.items.length) {
      const grown = new Int32Array(this.items.length * 2);
      grown.set(this.items);
      this.items = grown;
    }
    const items = this.items;
    let i = this.count++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const above = items[parent]!;
      if (above <= value) break;
      items[i] = above;
      i = parent;
    }
    items[i] = value;
  }

  /** Remove and return the smallest item. The heap must not be empty. */
  pop(): number {
    const items = this.items;
    const top = items[0]!;
    const size = --this.count;
    const last = items[size]!;
    if (size === 0) return top;
    let i = 0;
    while (true) {
      let child = 2 * i + 1;
      if (child >= size) break;
      if (child + 1 < size && items[child + 1]! < items[child]!) child++;
      const below = items[child]!;
      if (below >= last) break;
      items[i] = below;
      i = child;
    }
    items[i] = last;
    return top;
  }
}

/**
 * A binary min-heap of `(key, value)` pairs ordered by key, then by value: with integer node ids as values,
 * ties between equal keys are broken by the smallest node. Grows on demand. Push and pop are O(log size).
 *
 * @internal
 */
export class KeyedMinHeap {
  private keys: Float64Array;
  private values: Int32Array;
  private count = 0;

  constructor(capacity = 16) {
    this.keys = new Float64Array(Math.max(capacity, 1));
    this.values = new Int32Array(Math.max(capacity, 1));
  }

  /** Number of stored pairs. */
  get size(): number {
    return this.count;
  }

  /** Key of the smallest pair. The heap must not be empty. */
  peekKey(): number {
    return this.keys[0]!;
  }

  /** Value of the smallest pair. The heap must not be empty. */
  peekValue(): number {
    return this.values[0]!;
  }

  /** Add the pair `(key, value)`. */
  push(key: number, value: number): void {
    if (this.count === this.keys.length) {
      const keys = new Float64Array(this.keys.length * 2);
      const values = new Int32Array(this.values.length * 2);
      keys.set(this.keys);
      values.set(this.values);
      this.keys = keys;
      this.values = values;
    }
    const keys = this.keys;
    const values = this.values;
    let i = this.count++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      const parentKey = keys[parent]!;
      const parentValue = values[parent]!;
      if (parentKey < key || (parentKey === key && parentValue <= value)) break;
      keys[i] = parentKey;
      values[i] = parentValue;
      i = parent;
    }
    keys[i] = key;
    values[i] = value;
  }

  /** Remove the smallest pair. The heap must not be empty. */
  pop(): void {
    const keys = this.keys;
    const values = this.values;
    const size = --this.count;
    if (size === 0) return;
    const lastKey = keys[size]!;
    const lastValue = values[size]!;
    let i = 0;
    while (true) {
      let child = 2 * i + 1;
      if (child >= size) break;
      const right = child + 1;
      if (
        right < size &&
        (keys[right]! < keys[child]! ||
          (keys[right] === keys[child] && values[right]! < values[child]!))
      ) {
        child = right;
      }
      const childKey = keys[child]!;
      const childValue = values[child]!;
      if (lastKey < childKey || (lastKey === childKey && lastValue <= childValue)) break;
      keys[i] = childKey;
      values[i] = childValue;
      i = child;
    }
    keys[i] = lastKey;
    values[i] = lastValue;
  }
}

/**
 * Scratch arrays for {@link tarjan}, sized for one graph. `index` and `component` must hold -1 for every node
 * the next run may visit.
 *
 * @internal
 */
export interface TarjanWorkspace {
  /** Discovery index of each node, -1 while unvisited. */
  readonly index: Int32Array;
  /** Tarjan's low-link value of each visited node. */
  readonly low: Int32Array;
  /** Raw component id of each node (assigned in order of completion), -1 while unassigned. */
  readonly component: Int32Array;
  /** Tarjan's stack of visited, unassigned nodes. */
  readonly stack: Int32Array;
  /** The explicit depth-first search stack (replaces recursion). */
  readonly callStack: Int32Array;
  /** Next adjacency position to scan for each frame of `callStack`. */
  readonly edgeCursor: Int32Array;
}

/**
 * Allocate a {@link TarjanWorkspace} for a graph with `nodeCount` nodes.
 *
 * @internal
 */
export function createTarjanWorkspace(nodeCount: number): TarjanWorkspace {
  return {
    index: new Int32Array(nodeCount).fill(-1),
    low: new Int32Array(nodeCount),
    component: new Int32Array(nodeCount).fill(-1),
    stack: new Int32Array(nodeCount),
    callStack: new Int32Array(nodeCount),
    edgeCursor: new Int32Array(nodeCount),
  };
}

/**
 * Iterative Tarjan (1972) strongly connected components over the subgraph induced by the nodes `v` with
 * `label[v] === token` (all nodes when `label` is null). Depth-first trees are started at `roots` in the
 * given order (all nodes ascending when `roots` is null); roots must belong to the subgraph.
 *
 * Raw component ids `firstComponent, firstComponent + 1, ...` are written to `workspace.component` in order
 * of completion, which is a reverse topological order of the condensation. Returns the number of components.
 *
 * Reference: Tarjan, R. E. 1972. "Depth-first search and linear graph algorithms". SIAM Journal on Computing
 * 1(2):146–160. The explicit stack (no recursion) keeps paths of any length safe. Complexity: O(n + m) for
 * the induced subgraph.
 *
 * @internal
 */
export function tarjan(
  offsets: Int32Array,
  targets: Int32Array,
  roots: Int32Array | null,
  label: Int32Array | null,
  token: number,
  workspace: TarjanWorkspace,
  firstComponent = 0,
): number {
  const { index, low, component, stack, callStack, edgeCursor } = workspace;
  const rootCount = roots === null ? offsets.length - 1 : roots.length;
  let counter = 0;
  let components = firstComponent;
  let stackSize = 0;
  for (let r = 0; r < rootCount; r++) {
    const root = roots === null ? r : roots[r]!;
    if (index[root] !== -1) continue;
    index[root] = counter;
    low[root] = counter;
    counter++;
    stack[stackSize++] = root;
    callStack[0] = root;
    edgeCursor[0] = offsets[root]!;
    let depth = 1;
    while (depth > 0) {
      const v = callStack[depth - 1]!;
      const cursor = edgeCursor[depth - 1]!;
      if (cursor < offsets[v + 1]!) {
        edgeCursor[depth - 1] = cursor + 1;
        const w = targets[cursor]!;
        if (label !== null && label[w] !== token) continue;
        if (index[w] === -1) {
          index[w] = counter;
          low[w] = counter;
          counter++;
          stack[stackSize++] = w;
          callStack[depth] = w;
          edgeCursor[depth] = offsets[w]!;
          depth++;
        } else if (component[w] === -1 && index[w]! < low[v]!) {
          // `w` is visited but unassigned, i.e. still on Tarjan's stack.
          low[v] = index[w]!;
        }
        continue;
      }
      depth--;
      if (low[v] === index[v]) {
        let x: number;
        do {
          x = stack[--stackSize]!;
          component[x] = components;
        } while (x !== v);
        components++;
      }
      if (depth > 0) {
        const parent = callStack[depth - 1]!;
        if (low[v]! < low[parent]!) low[parent] = low[v]!;
      }
    }
  }
  return components - firstComponent;
}
