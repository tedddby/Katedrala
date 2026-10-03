/**
 * Scale tests: every traversal-like algorithm must handle paths far longer than any call stack (300 000
 * nodes) and large random graphs. These tests assert results, never timings.
 */
import { describe, expect, it } from "vitest";
import { betweennessCentrality } from "./centrality.js";
import { louvain } from "./clustering.js";
import { elementaryCycles, shortestCycleThrough } from "./cycles.js";
import { longestPathLengths, topologicalOrder } from "./dag.js";
import { Digraph } from "./digraph.js";
import { greedyFeedbackArcSet } from "./feedback.js";
import { pageRank } from "./pagerank.js";
import { createRandom } from "./random.js";
import { propagationCost, reachabilityCounts } from "./reachability.js";
import { condensation, stronglyConnectedComponents } from "./scc.js";
import { bfs, reachableFrom, shortestPath } from "./traversal.js";

const PATH_NODES = 300_000;
const RANDOM_NODES = 100_000;

/** 0 → 1 → … → n − 1, optionally closed into a cycle. */
function path(n: number, closed = false): Digraph {
  const m = closed ? n : n - 1;
  const sources = new Int32Array(m);
  const targets = new Int32Array(m);
  for (let i = 0; i < m; i++) {
    sources[i] = i;
    targets[i] = (i + 1) % n;
  }
  return Digraph.fromEdges(n, sources, targets);
}

/** A uniformly random graph; with `acyclic`, every edge points from the smaller to the larger node. */
function randomGraph(n: number, m: number, seed: number, acyclic: boolean): Digraph {
  const random = createRandom(seed);
  const sources = new Int32Array(m);
  const targets = new Int32Array(m);
  for (let e = 0; e < m; e++) {
    let a = Math.floor(random() * n);
    let b = Math.floor(random() * n);
    if (acyclic && a === b) b = (a + 1) % n;
    if (acyclic && a > b) [a, b] = [b, a];
    sources[e] = a;
    targets[e] = b;
  }
  return Digraph.fromEdges(n, sources, targets);
}

describe(`a ${PATH_NODES}-node path`, () => {
  const graph = path(PATH_NODES);
  const last = PATH_NODES - 1;

  it("strongly connected components and condensation", () => {
    const scc = stronglyConnectedComponents(graph);
    expect(scc.count).toBe(PATH_NODES);
    expect(scc.componentOf[last]).toBe(last);
    expect(condensation(graph, scc).edgeCount).toBe(last);
  });

  it("breadth-first search, reachability and shortest paths", () => {
    const result = bfs(graph, [0]);
    expect(result.order.length).toBe(PATH_NODES);
    expect(result.distance[last]).toBe(last);
    expect(bfs(graph, [last], { direction: "in" }).distance[0]).toBe(last);
    expect(reachableFrom(graph, [0]).reduce((a, b) => a + b, 0)).toBe(PATH_NODES);
    expect(shortestPath(graph, 0, last)?.length).toBe(PATH_NODES);
  });

  it("topological order and longest paths", () => {
    const order = topologicalOrder(graph);
    expect(order[0]).toBe(0);
    expect(order[last]).toBe(last);
    expect(longestPathLengths(graph)[0]).toBe(last);
    expect(longestPathLengths(graph, "in")[last]).toBe(last);
  });

  it("reachability counts (estimated beyond the exact threshold)", () => {
    const out = reachabilityCounts(graph, "out");
    expect(out.exact).toBe(false);
    expect(out.counts[last]).toBe(0);
    expect(out.counts[last - 1]).toBe(1); // the bounds pin it: one successor, one later node
    expect(Math.abs(out.counts[0]! - last) / last).toBeLessThan(0.5);
    const into = reachabilityCounts(graph, "in");
    expect(into.counts[0]).toBe(0);
    expect(propagationCost(graph)).toBeGreaterThan(0);
  });

  it("PageRank and sampled betweenness", () => {
    const { values, converged } = pageRank(graph);
    expect(converged).toBe(true);
    expect(values[last]).toBeGreaterThan(values[0]!);
    const sampled = betweennessCentrality(graph, { sample: { pivots: 4, seed: 1 } });
    expect(sampled.exact).toBe(false);
    expect(sampled.values.length).toBe(PATH_NODES);
  });
});

describe(`a ${PATH_NODES}-node cycle`, () => {
  const graph = path(PATH_NODES, true);

  it("is one component with one elementary cycle", () => {
    expect(stronglyConnectedComponents(graph).count).toBe(1);
    const { cycles, truncated } = elementaryCycles(graph, { maxCycles: 10 });
    expect(truncated).toBe(false);
    expect(cycles.length).toBe(1);
    expect(cycles[0]!.length).toBe(PATH_NODES);
    expect(elementaryCycles(graph, { maxCycles: 10, maxLength: 1000 }).cycles).toEqual([]);
    expect(shortestCycleThrough(graph, 12_345)?.length).toBe(PATH_NODES);
  });

  it("needs one feedback arc and has full reachability", () => {
    expect(greedyFeedbackArcSet(graph)).toHaveLength(1);
    const { counts, exact } = reachabilityCounts(graph, "out");
    expect(exact).toBe(true); // a single component
    expect(counts[0]).toBe(PATH_NODES - 1);
    expect(() => topologicalOrder(graph)).toThrow();
  });
});

describe(`a ${RANDOM_NODES}-node random graph`, () => {
  const graph = randomGraph(RANDOM_NODES, 3 * RANDOM_NODES, 42, false);

  it("strongly connected components, BFS and reachability", () => {
    const scc = stronglyConnectedComponents(graph);
    const largest = Math.max(...scc.components.map((c) => c.length));
    expect(largest).toBeGreaterThan(RANDOM_NODES / 2);
    const { order } = bfs(graph, [0]);
    expect(order.length).toBeGreaterThan(largest - 1);
    const { counts } = reachabilityCounts(graph, "out");
    expect(counts[order[0]!]).toBeGreaterThanOrEqual(largest - 1);
  });

  it("short elementary cycles", () => {
    const { cycles, truncated } = elementaryCycles(graph, {
      maxCycles: Number.POSITIVE_INFINITY,
      maxLength: 3,
    });
    expect(truncated).toBe(false);
    for (const cycle of cycles) {
      expect(cycle.length).toBeLessThanOrEqual(3);
      expect(Math.min(...cycle)).toBe(cycle[0]);
    }
  });

  it("feedback arcs, PageRank and Louvain", () => {
    const arcs = greedyFeedbackArcSet(graph);
    expect(arcs.length).toBeGreaterThan(0);
    expect(pageRank(graph).converged).toBe(true);
    const clusters = louvain(graph.toUndirected());
    expect(clusters.count).toBeGreaterThan(1);
    expect(clusters.modularity).toBeGreaterThan(0.3);
  });
});

describe(`a ${RANDOM_NODES}-node random DAG`, () => {
  const dag = randomGraph(RANDOM_NODES, 3 * RANDOM_NODES, 7, true);

  it("topological order, longest paths and reachability", () => {
    const order = topologicalOrder(dag);
    const position = new Int32Array(RANDOM_NODES);
    order.forEach((v, i) => (position[v] = i));
    for (const [u, v] of dag.edges())
      if (position[u]! >= position[v]!) throw new Error(`edge ${u}→${v}`);
    const depth = longestPathLengths(dag);
    const height = longestPathLengths(dag, "in");
    expect(Math.max(...depth)).toBe(Math.max(...height));
    const { counts, exact } = reachabilityCounts(dag, "out");
    expect(exact).toBe(false);
    expect(counts.length).toBe(RANDOM_NODES);
    expect(stronglyConnectedComponents(dag).count).toBe(RANDOM_NODES);
  });
});
