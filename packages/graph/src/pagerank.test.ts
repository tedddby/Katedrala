import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Digraph, GraphError } from "./digraph.js";
import { pageRank } from "./pagerank.js";

const graphArb = (maxNodes: number, maxEdges: number) =>
  fc.integer({ min: 1, max: maxNodes }).chain((n) =>
    fc
      .array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1), fc.integer({ min: 1, max: 9 })), {
        maxLength: maxEdges,
      })
      .map((triples) => Digraph.fromPairs(n, triples)),
  );

/** L1 norm of x − F(x), where F is one PageRank step (the fixpoint equation). */
function residual(graph: Digraph, x: Float64Array, damping: number, weighted: boolean): number {
  const n = graph.nodeCount;
  const outTotal = new Array<number>(n).fill(0);
  for (const [u, , w] of graph.edges()) outTotal[u]! += weighted ? w : 1;
  let dangling = 0;
  for (let u = 0; u < n; u++) if (outTotal[u] === 0) dangling += x[u]!;
  const next = new Array<number>(n).fill((1 - damping) / n + (damping * dangling) / n);
  for (const [u, v, w] of graph.edges()) {
    if (outTotal[u]! > 0) next[v]! += (damping * x[u]! * (weighted ? w : 1)) / outTotal[u]!;
  }
  return next.reduce((sum, value, v) => sum + Math.abs(value - x[v]!), 0);
}

const sum = (values: Float64Array) => values.reduce((a, b) => a + b, 0);

describe("pageRank", () => {
  it("handles empty and single-node graphs", () => {
    expect(pageRank(Digraph.fromPairs(0, []))).toEqual({
      values: new Float64Array(0),
      iterations: 0,
      converged: true,
    });
    expect([...pageRank(Digraph.fromPairs(1, [])).values]).toEqual([1]);
    expect([...pageRank(Digraph.fromPairs(1, [[0, 0]])).values]).toEqual([1]);
  });

  it("treats symmetric disconnected parts alike", () => {
    const g = Digraph.fromPairs(4, [
      [0, 1],
      [1, 0],
      [2, 3],
      [3, 2],
    ]);
    pageRank(g).values.forEach((x) => {
      expect(x).toBeCloseTo(0.25, 14);
    });
  });

  it("matches the closed form for a single edge with a dangling target", () => {
    // x0 = 1/(2 + d), x1 = 1 − x0.
    const { values, converged } = pageRank(Digraph.fromPairs(2, [[0, 1]]));
    expect(converged).toBe(true);
    expect(values[0]).toBeCloseTo(1 / 2.85, 10);
    expect(values[1]).toBeCloseTo(1 - 1 / 2.85, 10);
  });

  it("ranks heavily used nodes highest (rank flows from user to used)", () => {
    const g = Digraph.fromPairs(6, [
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 4],
    ]);
    const { values } = pageRank(g);
    const best = values.indexOf(Math.max(...values));
    expect(best).toBe(0);
    expect(values[4]).toBeGreaterThan(values[5]!);
  });

  it("splits rank by weight when weighted", () => {
    const g = Digraph.fromPairs(3, [
      [0, 1, 3],
      [0, 2, 1],
      [1, 0, 1],
      [2, 0, 1],
    ]);
    const weighted = pageRank(g, { weighted: true }).values;
    const unweighted = pageRank(g).values;
    expect(weighted[1]).toBeGreaterThan(weighted[2]!);
    expect(unweighted[1]).toBeCloseTo(unweighted[2]!, 12);
    expect(residual(g, weighted, 0.85, true)).toBeLessThan(1e-9);
  });

  it("treats uniform weights like the unweighted walk", () => {
    const g = Digraph.fromPairs(4, [
      [0, 1, 2],
      [0, 2, 2],
      [2, 3, 2],
      [3, 0, 2],
    ]);
    const a = pageRank(g, { weighted: true }).values;
    const b = pageRank(g).values;
    a.forEach((x, v) => {
      expect(x).toBeCloseTo(b[v]!, 12);
    });
  });

  it("treats nodes whose out-edges all weigh zero as dangling", () => {
    const g = Digraph.fromPairs(3, [
      [0, 1, 0],
      [1, 2, 1],
    ]);
    const { values } = pageRank(g, { weighted: true });
    expect(residual(g, values, 0.85, true)).toBeLessThan(1e-9);
    expect(sum(values)).toBeCloseTo(1, 12);
  });

  it("is uniform without damping", () => {
    const g = Digraph.fromPairs(3, [
      [0, 1],
      [1, 2],
    ]);
    expect([...pageRank(g, { damping: 0 }).values]).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it("reports non-convergence when iterations run out", () => {
    const g = Digraph.fromPairs(3, [
      [0, 1],
      [1, 2],
    ]);
    const result = pageRank(g, { maxIterations: 2 });
    expect(result.converged).toBe(false);
    expect(result.iterations).toBe(2);
    expect(sum(result.values)).toBeCloseTo(1, 14);
    const none = pageRank(g, { maxIterations: 0 });
    expect([...none.values]).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(none.converged).toBe(false);
  });

  it("rejects invalid options and negative weights", () => {
    const g = Digraph.fromPairs(2, [[0, 1, -1]]);
    expect(() => pageRank(g, { weighted: true })).toThrow(GraphError);
    expect(() => pageRank(g)).not.toThrow();
    expect(() => pageRank(g, { damping: 1.5 })).toThrow(GraphError);
    expect(() => pageRank(g, { damping: Number.NaN })).toThrow(GraphError);
    expect(() => pageRank(g, { tolerance: -1 })).toThrow(GraphError);
    expect(() => pageRank(g, { maxIterations: -1 })).toThrow(GraphError);
  });

  it("sums to one and satisfies the fixpoint equation", () => {
    fc.assert(
      fc.property(
        graphArb(15, 40),
        fc.double({ min: 0, max: 0.95, noNaN: true }),
        fc.boolean(),
        (graph, damping, weighted) => {
          const result = pageRank(graph, { damping, weighted });
          expect(result.converged).toBe(true);
          expect(sum(result.values)).toBeCloseTo(1, 12);
          for (const x of result.values) expect(x).toBeGreaterThan(0);
          expect(residual(graph, result.values, damping, weighted)).toBeLessThan(1e-9);
          expect([...pageRank(graph, { damping, weighted }).values]).toEqual([...result.values]);
        },
      ),
    );
  });
});
