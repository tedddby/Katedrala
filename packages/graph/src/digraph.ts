/**
 * Immutable, compact graph representations used by every algorithm in this package.
 *
 * Nodes are the integers `0 .. nodeCount - 1`. Adjacency is stored in compressed sparse row (CSR) form in
 * typed arrays: memory is proportional to nodes + edges, iteration is cache-friendly, and the neighbours of
 * every node are sorted ascending, which makes every traversal order deterministic.
 */

/** Error thrown for invalid graph construction arguments. */
export class GraphError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphError";
  }
}

export interface BuildOptions {
  /**
   * Merge parallel edges (same source and target) into one edge whose weight is the sum of their weights.
   * Default `true`. When `false`, parallel edges are kept as separate entries.
   */
  mergeParallelEdges?: boolean;
  /** Keep edges from a node to itself. Default `true`. */
  keepSelfLoops?: boolean;
}

function assertNode(node: number, nodeCount: number, what: string): void {
  if (!Number.isInteger(node) || node < 0 || node >= nodeCount) {
    throw new GraphError(`${what} ${node} is not a node of a graph with ${nodeCount} nodes`);
  }
}

/** Sort the entries `[start, end)` of parallel arrays by key (ascending, stable). */
function sortRow(keys: Int32Array, values: Float64Array, start: number, end: number): void {
  const length = end - start;
  if (length < 2) return;
  if (length <= 24) {
    for (let i = start + 1; i < end; i++) {
      const key = keys[i]!;
      const value = values[i]!;
      let j = i - 1;
      while (j >= start && keys[j]! > key) {
        keys[j + 1] = keys[j]!;
        values[j + 1] = values[j]!;
        j--;
      }
      keys[j + 1] = key;
      values[j + 1] = value;
    }
    return;
  }
  const order = Array.from({ length }, (_, i) => start + i);
  order.sort((a, b) => keys[a]! - keys[b]! || a - b);
  const sortedKeys = order.map((i) => keys[i]!);
  const sortedValues = order.map((i) => values[i]!);
  for (let i = 0; i < length; i++) {
    keys[start + i] = sortedKeys[i]!;
    values[start + i] = sortedValues[i]!;
  }
}

interface Csr {
  offsets: Int32Array;
  targets: Int32Array;
  weights: Float64Array;
}

/** Build a CSR adjacency (rows = `rowOf`, columns = `columnOf`) with sorted rows. */
function buildCsr(
  nodeCount: number,
  rowOf: ArrayLike<number>,
  columnOf: ArrayLike<number>,
  weightOf: ArrayLike<number> | undefined,
  include: Uint8Array,
  merge: boolean,
): Csr {
  const counts = new Int32Array(nodeCount + 1);
  for (let e = 0; e < rowOf.length; e++) if (include[e] === 1) counts[rowOf[e]! + 1]!++;
  for (let v = 0; v < nodeCount; v++) counts[v + 1]! += counts[v]!;
  const total = counts[nodeCount]!;
  const keys = new Int32Array(total);
  const values = new Float64Array(total);
  const cursor = counts.slice(0, nodeCount);
  for (let e = 0; e < rowOf.length; e++) {
    if (include[e] !== 1) continue;
    const position = cursor[rowOf[e]!]!++;
    keys[position] = columnOf[e]!;
    values[position] = weightOf === undefined ? 1 : weightOf[e]!;
  }
  for (let v = 0; v < nodeCount; v++) sortRow(keys, values, counts[v]!, counts[v + 1]!);
  if (!merge) return { offsets: counts, targets: keys, weights: values };

  const offsets = new Int32Array(nodeCount + 1);
  const mergedKeys = new Int32Array(total);
  const mergedValues = new Float64Array(total);
  let size = 0;
  for (let v = 0; v < nodeCount; v++) {
    offsets[v] = size;
    for (let i = counts[v]!; i < counts[v + 1]!; i++) {
      if (size > offsets[v]! && mergedKeys[size - 1] === keys[i]) {
        mergedValues[size - 1]! += values[i]!;
      } else {
        mergedKeys[size] = keys[i]!;
        mergedValues[size] = values[i]!;
        size++;
      }
    }
  }
  offsets[nodeCount] = size;
  return { offsets, targets: mergedKeys.slice(0, size), weights: mergedValues.slice(0, size) };
}

/**
 * An immutable directed graph with weighted edges, stored in CSR form for both directions.
 *
 * Successors and predecessors of every node are sorted ascending. Edge `i` in the out-adjacency is the pair
 * (`u`, `outTargets[i]`) where `outOffsets[u] <= i < outOffsets[u + 1]`.
 */
export class Digraph {
  /** Out-adjacency offsets (length `nodeCount + 1`). */
  readonly outOffsets: Int32Array;
  /** Out-adjacency targets (length `edgeCount`). */
  readonly outTargets: Int32Array;
  /** Weight of each out-edge (length `edgeCount`). */
  readonly outWeights: Float64Array;
  /** In-adjacency offsets (length `nodeCount + 1`). */
  readonly inOffsets: Int32Array;
  /** In-adjacency sources (length `edgeCount`). */
  readonly inSources: Int32Array;
  /** Weight of each in-edge (length `edgeCount`). */
  readonly inWeights: Float64Array;

  private constructor(
    readonly nodeCount: number,
    out: Csr,
    incoming: Csr,
  ) {
    this.outOffsets = out.offsets;
    this.outTargets = out.targets;
    this.outWeights = out.weights;
    this.inOffsets = incoming.offsets;
    this.inSources = incoming.targets;
    this.inWeights = incoming.weights;
  }

  /** Number of edges (after merging parallel edges, when enabled). */
  get edgeCount(): number {
    return this.outTargets.length;
  }

  /**
   * Build a graph from parallel arrays of edge endpoints.
   *
   * @param weights - edge weights (default 1 for every edge).
   */
  static fromEdges(
    nodeCount: number,
    sources: ArrayLike<number>,
    targets: ArrayLike<number>,
    weights?: ArrayLike<number>,
    options: BuildOptions = {},
  ): Digraph {
    if (!Number.isInteger(nodeCount) || nodeCount < 0) {
      throw new GraphError(`Invalid node count ${nodeCount}`);
    }
    if (sources.length !== targets.length) {
      throw new GraphError("sources and targets must have the same length");
    }
    if (weights !== undefined && weights.length !== sources.length) {
      throw new GraphError("weights must have the same length as sources");
    }
    const merge = options.mergeParallelEdges ?? true;
    const keepSelfLoops = options.keepSelfLoops ?? true;
    const include = new Uint8Array(sources.length);
    for (let e = 0; e < sources.length; e++) {
      const s = sources[e]!;
      const t = targets[e]!;
      assertNode(s, nodeCount, "Source");
      assertNode(t, nodeCount, "Target");
      if (weights !== undefined && !Number.isFinite(weights[e])) {
        throw new GraphError(`Edge ${e} has a non-finite weight`);
      }
      include[e] = keepSelfLoops || s !== t ? 1 : 0;
    }
    const out = buildCsr(nodeCount, sources, targets, weights, include, merge);
    const incoming = buildCsr(nodeCount, targets, sources, weights, include, merge);
    return new Digraph(nodeCount, out, incoming);
  }

  /**
   * Build a graph from a list of `[source, target]` or `[source, target, weight]` tuples.
   *
   * @throws GraphError on an invalid node count, an endpoint that is not a node (validated as given, before
   * any conversion), or a non-finite weight.
   */
  static fromPairs(
    nodeCount: number,
    pairs: ReadonlyArray<readonly [number, number] | readonly [number, number, number]>,
    options: BuildOptions = {},
  ): Digraph {
    // Plain arrays, not typed ones: storing an endpoint in an Int32Array would coerce invalid values
    // (undefined, NaN, 1.5, 2^32 + 1) to valid node numbers before fromEdges could reject them.
    const sources = pairs.map((pair) => pair[0]);
    const targets = pairs.map((pair) => pair[1]);
    const weights = pairs.map((pair) => pair[2] ?? 1);
    return Digraph.fromEdges(nodeCount, sources, targets, weights, options);
  }

  /** Successors of `node`, ascending (a view; do not mutate). */
  successors(node: number): Int32Array {
    return this.outTargets.subarray(this.outOffsets[node], this.outOffsets[node + 1]);
  }

  /** Predecessors of `node`, ascending (a view; do not mutate). */
  predecessors(node: number): Int32Array {
    return this.inSources.subarray(this.inOffsets[node], this.inOffsets[node + 1]);
  }

  outDegree(node: number): number {
    return this.outOffsets[node + 1]! - this.outOffsets[node]!;
  }

  inDegree(node: number): number {
    return this.inOffsets[node + 1]! - this.inOffsets[node]!;
  }

  /** Index of edge `source → target` in the out-adjacency arrays, or -1 (binary search). */
  edgeIndex(source: number, target: number): number {
    let low = this.outOffsets[source]!;
    let high = this.outOffsets[source + 1]! - 1;
    while (low <= high) {
      const mid = (low + high) >>> 1;
      const value = this.outTargets[mid]!;
      if (value === target) return mid;
      if (value < target) low = mid + 1;
      else high = mid - 1;
    }
    return -1;
  }

  hasEdge(source: number, target: number): boolean {
    return this.edgeIndex(source, target) !== -1;
  }

  /** Weight of edge `source → target`, or 0 when absent. */
  weight(source: number, target: number): number {
    const index = this.edgeIndex(source, target);
    return index === -1 ? 0 : this.outWeights[index]!;
  }

  /** The graph with every edge reversed (shares no mutable state; O(1)). */
  reverse(): Digraph {
    return new Digraph(
      this.nodeCount,
      { offsets: this.inOffsets, targets: this.inSources, weights: this.inWeights },
      { offsets: this.outOffsets, targets: this.outTargets, weights: this.outWeights },
    );
  }

  /** Iterate edges as `[source, target, weight]` in (source, target) order. */
  *edges(): IterableIterator<[number, number, number]> {
    for (let u = 0; u < this.nodeCount; u++) {
      for (let i = this.outOffsets[u]!; i < this.outOffsets[u + 1]!; i++) {
        yield [u, this.outTargets[i]!, this.outWeights[i]!];
      }
    }
  }

  /**
   * The induced subgraph on `nodes` (given in any order; duplicates ignored): every edge of this graph
   * between selected nodes, with its weight. Node `i` of the result is the i-th smallest selected node;
   * `mapping[i]` gives its id in this graph. Parallel edges (of a graph built without merging) stay
   * separate, and self-loops are kept, so the induced subgraph on all nodes equals this graph.
   *
   * @throws GraphError if an entry of `nodes` is not a node.
   */
  inducedSubgraph(nodes: Iterable<number>): { graph: Digraph; mapping: Int32Array } {
    const unique = new Set<number>();
    for (const node of nodes) {
      assertNode(node, this.nodeCount, "Node");
      unique.add(node);
    }
    const selected = Int32Array.from(unique).sort();
    const local = new Int32Array(this.nodeCount).fill(-1);
    selected.forEach((node, i) => {
      local[node] = i;
    });
    const sources: number[] = [];
    const targets: number[] = [];
    const weights: number[] = [];
    for (const node of selected) {
      for (let i = this.outOffsets[node]!; i < this.outOffsets[node + 1]!; i++) {
        const target = local[this.outTargets[i]!]!;
        if (target === -1) continue;
        sources.push(local[node]!);
        targets.push(target);
        weights.push(this.outWeights[i]!);
      }
    }
    // These are this graph's edges, merged or not as it was built, so they are copied unchanged.
    return {
      graph: Digraph.fromEdges(selected.length, sources, targets, weights, {
        mergeParallelEdges: false,
      }),
      mapping: selected,
    };
  }

  /**
   * The undirected version of this graph: `u — v` with weight `w(u→v) + w(v→u)`. Self-loops keep their
   * weight. Used by modularity-based clustering.
   */
  toUndirected(): UndirectedGraph {
    const sources: number[] = [];
    const targets: number[] = [];
    const weights: number[] = [];
    for (const [u, v, w] of this.edges()) {
      sources.push(Math.min(u, v));
      targets.push(Math.max(u, v));
      weights.push(w);
    }
    return UndirectedGraph.fromEdges(this.nodeCount, sources, targets, weights);
  }
}

/**
 * An immutable undirected weighted graph in CSR form. Every non-loop edge `{u, v}` appears in both adjacency
 * rows; a self-loop appears once in its node's row. Neighbours are sorted ascending.
 */
export class UndirectedGraph {
  private constructor(
    readonly nodeCount: number,
    /** Adjacency offsets (length `nodeCount + 1`). */
    readonly offsets: Int32Array,
    /** Neighbour of each adjacency entry. */
    readonly neighbors: Int32Array,
    /** Weight of each adjacency entry. */
    readonly weights: Float64Array,
    /** Sum of the weights of all edges, each edge counted once. */
    readonly totalWeight: number,
  ) {}

  /** Build from edge lists; parallel edges (in either orientation) are merged by summing weights. */
  static fromEdges(
    nodeCount: number,
    sources: ArrayLike<number>,
    targets: ArrayLike<number>,
    weights?: ArrayLike<number>,
  ): UndirectedGraph {
    if (sources.length !== targets.length) {
      throw new GraphError("sources and targets must have the same length");
    }
    const rows: number[] = [];
    const columns: number[] = [];
    const values: number[] = [];
    let total = 0;
    for (let e = 0; e < sources.length; e++) {
      const u = sources[e]!;
      const v = targets[e]!;
      assertNode(u, nodeCount, "Endpoint");
      assertNode(v, nodeCount, "Endpoint");
      const w = weights === undefined ? 1 : weights[e]!;
      if (!Number.isFinite(w)) throw new GraphError(`Edge ${e} has a non-finite weight`);
      total += w;
      rows.push(u);
      columns.push(v);
      values.push(w);
      if (u !== v) {
        rows.push(v);
        columns.push(u);
        values.push(w);
      }
    }
    const csr = buildCsr(
      nodeCount,
      rows,
      columns,
      values,
      new Uint8Array(rows.length).fill(1),
      true,
    );
    return new UndirectedGraph(nodeCount, csr.offsets, csr.targets, csr.weights, total);
  }

  /** Neighbours of `node`, ascending (a view; do not mutate). */
  neighborsOf(node: number): Int32Array {
    return this.neighbors.subarray(this.offsets[node], this.offsets[node + 1]);
  }

  degree(node: number): number {
    return this.offsets[node + 1]! - this.offsets[node]!;
  }

  /**
   * Weighted degree ("strength") of `node`: the sum of incident edge weights, with self-loops counted twice
   * (the convention used by modularity).
   */
  strength(node: number): number {
    let sum = 0;
    for (let i = this.offsets[node]!; i < this.offsets[node + 1]!; i++) {
      sum += this.neighbors[i] === node ? 2 * this.weights[i]! : this.weights[i]!;
    }
    return sum;
  }
}
