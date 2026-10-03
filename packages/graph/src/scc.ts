/**
 * Strongly connected components and the condensation (component DAG) of a {@link Digraph}.
 */

import { Digraph, GraphError } from "./digraph.js";
import { createTarjanWorkspace, tarjan } from "./internal.js";

/** The strongly connected components of a graph, in canonical order. */
export interface StronglyConnectedComponents {
  /** Number of components. */
  readonly count: number;
  /** Component id of every node. */
  readonly componentOf: Int32Array;
  /**
   * Members of each component, ascending. Components are ordered by their smallest member, and the id of a
   * component is its position in this list. The arrays are views into one shared buffer; do not mutate them.
   */
  readonly components: Int32Array[];
}

/**
 * Strongly connected components with Tarjan's algorithm (Tarjan, R. E. 1972. "Depth-first search and linear
 * graph algorithms". SIAM Journal on Computing 1(2):146–160), implemented with an explicit stack so that
 * arbitrarily long paths cannot overflow the call stack.
 *
 * Output is canonical: components are ordered by their smallest member, members are sorted ascending and the
 * id of a component is its position in that order. It therefore depends only on the graph, never on traversal
 * details.
 *
 * Complexity: O(n + m) time, O(n) space.
 */
export function stronglyConnectedComponents(graph: Digraph): StronglyConnectedComponents {
  const n = graph.nodeCount;
  const workspace = createTarjanWorkspace(n);
  const rawCount = tarjan(graph.outOffsets, graph.outTargets, null, null, 0, workspace);
  const raw = workspace.component;
  // Renumber by first appearance in ascending node order, i.e. by smallest member.
  const remap = new Int32Array(rawCount).fill(-1);
  const componentOf = new Int32Array(n);
  const starts = new Int32Array(rawCount + 1);
  let count = 0;
  for (let v = 0; v < n; v++) {
    const r = raw[v]!;
    let id = remap[r]!;
    if (id === -1) {
      id = count++;
      remap[r] = id;
    }
    componentOf[v] = id;
    starts[id + 1]!++;
  }
  for (let id = 0; id < count; id++) starts[id + 1]! += starts[id]!;
  const members = new Int32Array(n);
  const cursor = starts.slice(0, count);
  for (let v = 0; v < n; v++) members[cursor[componentOf[v]!]!++] = v;
  const components = Array.from({ length: count }, (_, id) =>
    members.subarray(starts[id], starts[id + 1]),
  );
  return { count, componentOf, components };
}

/**
 * Whether a component (given by its members) contains a cycle: it has more than one node, or it is a single
 * node with a self-loop. Only such components take part in dependency cycles — the cyclic physical
 * dependencies of Lakos, J. 1996. "Large-Scale C++ Software Design". Addison-Wesley.
 *
 * Complexity: O(log d) for a single node of out-degree d (one binary search for the self-loop), O(1)
 * otherwise. Determinism: a pure function of its arguments.
 */
export function isNontrivialComponent(graph: Digraph, members: ArrayLike<number>): boolean {
  if (members.length > 1) return true;
  if (members.length === 0) return false;
  const node = members[0]!;
  return graph.hasEdge(node, node);
}

/**
 * The condensation of `graph`: one node per strongly connected component (node `i` is component `i` of
 * `scc`), and an edge between two components whenever some edge joins their members. The weight of a
 * condensation edge is the sum of the weights of the edges it represents; edges inside a component are
 * dropped, so the result has no self-loops and is acyclic (Harary, F., Norman, R. Z. & Cartwright, D. 1965.
 * "Structural Models: An Introduction to the Theory of Directed Graphs". Wiley).
 *
 * Complexity: O(n + m log m) time (edge sorting during construction), O(n + m) space. Determinism: edges
 * are summed in ascending (source, target) order, so weights are bit-for-bit reproducible.
 *
 * @param scc - the result of {@link stronglyConnectedComponents} for `graph`.
 * @throws GraphError if `scc` does not describe a partition of `graph`'s nodes.
 */
export function condensation(graph: Digraph, scc: StronglyConnectedComponents): Digraph {
  const { componentOf, count } = scc;
  const n = graph.nodeCount;
  if (componentOf.length !== n) {
    throw new GraphError(`Component assignment has ${componentOf.length} entries for ${n} nodes`);
  }
  const { outOffsets: offsets, outTargets: targets, outWeights: weights } = graph;
  let m = 0;
  for (let u = 0; u < n; u++) {
    const cu = componentOf[u]!;
    for (let i = offsets[u]!; i < offsets[u + 1]!; i++) if (componentOf[targets[i]!] !== cu) m++;
  }
  const sources = new Int32Array(m);
  const sinks = new Int32Array(m);
  const sums = new Float64Array(m);
  let e = 0;
  for (let u = 0; u < n; u++) {
    const cu = componentOf[u]!;
    for (let i = offsets[u]!; i < offsets[u + 1]!; i++) {
      const cv = componentOf[targets[i]!]!;
      if (cv === cu) continue;
      sources[e] = cu;
      sinks[e] = cv;
      sums[e] = weights[i]!;
      e++;
    }
  }
  return Digraph.fromEdges(count, sources, sinks, sums);
}
