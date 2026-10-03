import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Digraph, GraphError } from "./digraph.js";
import { createRandom } from "./random.js";
import { propagationCost, reachabilityCounts } from "./reachability.js";
import { condensation, stronglyConnectedComponents } from "./scc.js";
import { topologicalOrder } from "./dag.js";
import type { Direction } from "./traversal.js";

const graphArb = (maxNodes: number, maxEdges: number) =>
  fc.integer({ min: 0, max: maxNodes }).chain((n) =>
    fc
      .array(fc.tuple(fc.nat(Math.max(0, n - 1)), fc.nat(Math.max(0, n - 1))), {
        maxLength: n === 0 ? 0 : maxEdges,
      })
      .map((pairs) => Digraph.fromPairs(n, pairs)),
  );

/** Reference: number of other nodes reachable from each node (Warshall's transitive closure). */
function closureCounts(graph: Digraph, direction: Direction): number[] {
  const n = graph.nodeCount;
  const reach = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j));
  for (const [u, v] of graph.edges()) {
    if (direction === "out") reach[u]![v] = true;
    else reach[v]![u] = true;
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      if (reach[i]![k]) for (let j = 0; j < n; j++) if (reach[k]![j]) reach[i]![j] = true;
  return reach.map((row) => row.filter(Boolean).length - 1);
}

/** A random graph with `n` nodes and `m` edges, mostly forward (so the condensation is large). */
function randomGraph(n: number, m: number, seed: number, backwardShare = 0.02): Digraph {
  const random = createRandom(seed);
  const pairs: [number, number][] = [];
  for (let e = 0; e < m; e++) {
    const a = Math.floor(random() * n);
    const b = Math.floor(random() * n);
    const forward = random() >= backwardShare;
    pairs.push(forward === a < b ? [a, b] : [b, a]);
  }
  return Digraph.fromPairs(n, pairs);
}

describe("reachabilityCounts (exact)", () => {
  it("counts other reachable nodes, including the rest of a node's component", () => {
    const g = Digraph.fromPairs(6, [
      [0, 1],
      [1, 2],
      [2, 1],
      [2, 3],
      [4, 4],
    ]);
    const out = reachabilityCounts(g, "out");
    expect(out.exact).toBe(true);
    expect([...out.counts]).toEqual([3, 2, 2, 0, 0, 0]);
    expect([...reachabilityCounts(g, "in").counts]).toEqual([0, 2, 2, 3, 0, 0]);
  });

  it("handles empty and edgeless graphs", () => {
    expect([...reachabilityCounts(Digraph.fromPairs(0, []), "out").counts]).toEqual([]);
    expect([...reachabilityCounts(Digraph.fromPairs(3, []), "in").counts]).toEqual([0, 0, 0]);
  });

  it("matches the transitive closure", () => {
    fc.assert(
      fc.property(graphArb(14, 35), fc.constantFrom<Direction>("out", "in"), (graph, direction) => {
        const result = reachabilityCounts(graph, direction);
        expect(result.exact).toBe(true);
        expect([...result.counts]).toEqual(closureCounts(graph, direction));
      }),
    );
  });

  it("is exact across many bitset words and large components", () => {
    // 150 nodes: several 32-bit words; cycles create multi-node components.
    const graph = randomGraph(150, 260, 5, 0.2);
    expect(stronglyConnectedComponents(graph).components.some((c) => c.length > 1)).toBe(true);
    for (const direction of ["out", "in"] as const) {
      expect([...reachabilityCounts(graph, direction).counts]).toEqual(
        closureCounts(graph, direction),
      );
    }
  });
});

describe("reachabilityCounts (estimated)", () => {
  it("is used above maxExactNodes, deterministically per seed", () => {
    const graph = randomGraph(400, 1200, 11);
    const a = reachabilityCounts(graph, "out", { maxExactNodes: 10, seed: 3 });
    const b = reachabilityCounts(graph, "out", { maxExactNodes: 10, seed: 3 });
    const c = reachabilityCounts(graph, "out", { maxExactNodes: 10, seed: 4 });
    expect(a.exact).toBe(false);
    expect([...a.counts]).toEqual([...b.counts]);
    expect([...a.counts]).not.toEqual([...c.counts]);
  });

  it("stays within the exact bounds and is exact for nodes without successors", () => {
    fc.assert(
      fc.property(
        graphArb(30, 60),
        fc.integer(),
        fc.constantFrom<Direction>("out", "in"),
        (graph, seed, direction) => {
          const exact = closureCounts(graph, direction);
          const estimate = reachabilityCounts(graph, direction, {
            maxExactNodes: 0,
            seed,
            sketchSize: 4,
          });
          expect(estimate.exact).toBe(graph.nodeCount === 0);
          const scc = stronglyConnectedComponents(graph);
          const dag =
            direction === "out" ? condensation(graph, scc) : condensation(graph, scc).reverse();
          const order = topologicalOrder(dag);
          const position = new Int32Array(scc.count);
          order.forEach((id, k) => (position[id] = k));
          for (let v = 0; v < graph.nodeCount; v++) {
            const id = scc.componentOf[v]!;
            const own = scc.components[id]!.length - 1;
            const successors = [...dag.successors(id)];
            const lower = own + successors.reduce((sum, d) => sum + scc.components[d]!.length, 0);
            let upper = own;
            for (let k = position[id]! + 1; k < scc.count; k++)
              upper += scc.components[order[k]!]!.length;
            const value = estimate.counts[v]!;
            expect(value).toBeGreaterThanOrEqual(lower);
            expect(value).toBeLessThanOrEqual(upper);
            if (successors.length === 0) expect(value).toBe(exact[v]);
          }
        },
      ),
    );
  });

  it("is unbiased across seeds", () => {
    // Node 0 → node 1 → 1000 sinks, plus 1000 isolated nodes: node 0 reaches 1001 nodes, and the exact
    // bounds [1, 2001] are far from that, so the estimate is effectively unclamped.
    const pairs: [number, number][] = [[0, 1]];
    for (let v = 2; v < 1002; v++) pairs.push([1, v]);
    const graph = Digraph.fromPairs(2002, pairs);
    const runs = 100;
    let sum = 0;
    for (let seed = 0; seed < runs; seed++) {
      sum += reachabilityCounts(graph, "out", { maxExactNodes: 0, seed }).counts[0]!;
    }
    // Relative standard error 1/√62 per run, so the standard error of the mean is about 12.7.
    expect(Math.abs(sum / runs - 1001)).toBeLessThan(50);
  });

  it("has the documented accuracy on a larger graph", () => {
    const graph = randomGraph(3000, 6000, 99);
    const exact = reachabilityCounts(graph, "out");
    expect(exact.exact).toBe(true);
    const estimate = reachabilityCounts(graph, "out", { maxExactNodes: 100 });
    expect(estimate.exact).toBe(false);
    let total = 0;
    let count = 0;
    for (let v = 0; v < graph.nodeCount; v++) {
      const truth = exact.counts[v]!;
      if (truth < 30) continue;
      total += Math.abs(estimate.counts[v]! - truth) / truth;
      count++;
    }
    expect(count).toBeGreaterThan(500);
    // Coefficient of variation 1/√62 ≈ 0.127, so the mean absolute relative error is about 0.1.
    expect(total / count).toBeLessThan(0.2);
  });

  it("rejects invalid options", () => {
    const g = Digraph.fromPairs(2, [[0, 1]]);
    expect(() => reachabilityCounts(g, "out", { sketchSize: 1 })).toThrow(GraphError);
    expect(() => reachabilityCounts(g, "out", { maxExactNodes: -1 })).toThrow(GraphError);
    expect(() => reachabilityCounts(g, "out", { seed: 0.5 })).toThrow(GraphError);
    expect(() => reachabilityCounts(g, "sideways" as Direction)).toThrow(GraphError);
  });
});

describe("propagationCost", () => {
  it("is the density of the visibility matrix", () => {
    expect(propagationCost(Digraph.fromPairs(0, []))).toBe(0);
    expect(propagationCost(Digraph.fromPairs(1, []))).toBe(1);
    expect(propagationCost(Digraph.fromPairs(4, []))).toBe(0.25);
    const chain = Digraph.fromPairs(3, [
      [0, 1],
      [1, 2],
    ]);
    expect(propagationCost(chain)).toBeCloseTo(6 / 9, 15);
    const cycle = Digraph.fromPairs(3, [
      [0, 1],
      [1, 2],
      [2, 0],
    ]);
    expect(propagationCost(cycle)).toBe(1);
    // Self-loops add nothing: every node already sees itself.
    expect(
      propagationCost(
        Digraph.fromPairs(2, [
          [0, 0],
          [1, 1],
        ]),
      ),
    ).toBe(0.5);
  });

  it("matches the transitive closure", () => {
    fc.assert(
      fc.property(graphArb(12, 30), (graph) => {
        const n = graph.nodeCount;
        const expected =
          n === 0 ? 0 : closureCounts(graph, "out").reduce((s, c) => s + c + 1, 0) / (n * n);
        expect(propagationCost(graph)).toBeCloseTo(expected, 12);
      }),
    );
  });

  it("passes options to the reachability computation", () => {
    const graph = randomGraph(500, 1500, 3);
    const exact = propagationCost(graph);
    const estimated = propagationCost(graph, { maxExactNodes: 0, seed: 8 });
    expect(estimated).not.toBe(exact);
    expect(Math.abs(estimated - exact) / exact).toBeLessThan(0.1);
  });
});
