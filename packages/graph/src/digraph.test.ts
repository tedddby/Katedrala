import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Digraph, GraphError, UndirectedGraph } from "./digraph.js";

const edgeList = (nodes: number) =>
  fc.array(fc.tuple(fc.nat(nodes - 1), fc.nat(nodes - 1), fc.integer({ min: 1, max: 5 })), {
    maxLength: 60,
  });

describe("Digraph", () => {
  it("stores sorted adjacency in both directions", () => {
    const g = Digraph.fromPairs(4, [
      [0, 3],
      [0, 1],
      [2, 1],
      [1, 3],
    ]);
    expect(g.nodeCount).toBe(4);
    expect(g.edgeCount).toBe(4);
    expect([...g.successors(0)]).toEqual([1, 3]);
    expect([...g.predecessors(1)]).toEqual([0, 2]);
    expect([...g.predecessors(3)]).toEqual([0, 1]);
    expect(g.outDegree(0)).toBe(2);
    expect(g.inDegree(2)).toBe(0);
    expect(g.hasEdge(2, 1)).toBe(true);
    expect(g.hasEdge(1, 2)).toBe(false);
  });

  it("merges parallel edges by summing weights unless disabled", () => {
    const merged = Digraph.fromPairs(2, [
      [0, 1, 2],
      [0, 1, 3],
    ]);
    expect(merged.edgeCount).toBe(1);
    expect(merged.weight(0, 1)).toBe(5);
    const kept = Digraph.fromPairs(
      2,
      [
        [0, 1, 2],
        [0, 1, 3],
      ],
      { mergeParallelEdges: false },
    );
    expect(kept.edgeCount).toBe(2);
  });

  it("keeps or drops self-loops", () => {
    expect(Digraph.fromPairs(1, [[0, 0]]).edgeCount).toBe(1);
    expect(Digraph.fromPairs(1, [[0, 0]], { keepSelfLoops: false }).edgeCount).toBe(0);
  });

  it("rejects invalid input", () => {
    expect(() => Digraph.fromPairs(2, [[0, 2]])).toThrow(GraphError);
    expect(() => Digraph.fromPairs(2, [[-1, 0]])).toThrow(GraphError);
    expect(() => Digraph.fromEdges(2, [0], [1, 1])).toThrow(GraphError);
    expect(() => Digraph.fromEdges(2, [0], [1], [Number.NaN])).toThrow(GraphError);
    expect(() => Digraph.fromEdges(-1, [], [])).toThrow(GraphError);
  });

  it("rejects endpoints that are not nodes in pairs, before any conversion", () => {
    // An Int32Array would turn them into node numbers: undefined and NaN into 0, 1.5 and 2^32 + 1 into 1.
    const invalid = [
      undefined,
      null,
      Number.NaN,
      1.5,
      2 ** 32 + 1,
      -1,
      3,
      Number.POSITIVE_INFINITY,
    ];
    for (const endpoint of invalid as number[]) {
      expect(() => Digraph.fromPairs(3, [[endpoint, 2]])).toThrow(GraphError);
      expect(() => Digraph.fromPairs(3, [[0, endpoint]])).toThrow(GraphError);
    }
    expect(() => Digraph.fromPairs(3, [[Number.NaN, 2]])).toThrow(
      "Source NaN is not a node of a graph with 3 nodes",
    );
    expect(() => Digraph.fromPairs(3, [[0, 2 ** 32 + 1]])).toThrow(
      "Target 4294967297 is not a node of a graph with 3 nodes",
    );
    expect(() => Digraph.fromPairs(3, [[0, 1, Number.NaN]])).toThrow(GraphError);
    expect(() => Digraph.fromPairs(1.5, [])).toThrow(GraphError);
  });

  it("reverses in constant time", () => {
    const g = Digraph.fromPairs(3, [
      [0, 1],
      [1, 2],
    ]);
    const r = g.reverse();
    expect([...r.successors(2)]).toEqual([1]);
    expect([...r.predecessors(0)]).toEqual([1]);
  });

  it("extracts induced subgraphs", () => {
    const g = Digraph.fromPairs(5, [
      [0, 1],
      [1, 4],
      [4, 0],
      [2, 3],
    ]);
    const { graph, mapping } = g.inducedSubgraph([4, 1, 0, 1]);
    expect([...mapping]).toEqual([0, 1, 4]);
    expect([...graph.edges()].map(([u, v]) => `${mapping[u]}>${mapping[v]}`)).toEqual([
      "0>1",
      "1>4",
      "4>0",
    ]);
  });

  it("rejects induced subgraph nodes that are not nodes, before any conversion", () => {
    const g = Digraph.fromPairs(3, [
      [0, 1],
      [1, 2],
    ]);
    const invalid = [undefined, Number.NaN, 1.5, 2 ** 32 + 2, -1, 3];
    for (const node of invalid as number[]) {
      expect(() => g.inducedSubgraph([node, 2])).toThrow(GraphError);
    }
    expect(() => g.inducedSubgraph([Number.NaN, 2])).toThrow(
      "Node NaN is not a node of a graph with 3 nodes",
    );
    expect([...g.inducedSubgraph([]).mapping]).toEqual([]);
  });

  it("keeps parallel edges, weights and self-loops in induced subgraphs", () => {
    const multigraph = Digraph.fromPairs(
      3,
      [
        [0, 1, 1],
        [0, 1, 2],
        [1, 1, 3],
        [1, 2, 4],
      ],
      { mergeParallelEdges: false },
    );
    const all = multigraph.inducedSubgraph([2, 1, 0]);
    expect(all.graph.edgeCount).toBe(4);
    expect([...all.graph.edges()]).toEqual([...multigraph.edges()]);
    expect([...all.graph.predecessors(1)]).toEqual([0, 0, 1]);
    expect([...multigraph.inducedSubgraph([0, 1]).graph.edges()]).toEqual([
      [0, 1, 1],
      [0, 1, 2],
      [1, 1, 3],
    ]);
    const merged = Digraph.fromPairs(2, [
      [0, 1, 1],
      [0, 1, 1],
    ]);
    expect([...merged.inducedSubgraph([0, 1]).graph.edges()]).toEqual([[0, 1, 2]]);
  });

  it("induces exactly the edges between the selected nodes", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),
        edgeList(10),
        fc.boolean(),
        fc.array(fc.nat(9), { maxLength: 12 }),
        (n, raw, mergeParallelEdges, picks) => {
          const g = Digraph.fromPairs(
            n,
            raw.filter(([u, v]) => u < n && v < n),
            { mergeParallelEdges },
          );
          const nodes = picks.filter((v) => v < n);
          const { graph, mapping } = g.inducedSubgraph(nodes);
          expect([...mapping]).toEqual([...new Set(nodes)].sort((a, b) => a - b));
          const selected = new Set(nodes);
          expect([...graph.edges()].map(([u, v, w]) => [mapping[u], mapping[v], w])).toEqual(
            [...g.edges()].filter(([u, v]) => selected.has(u) && selected.has(v)),
          );
          const everything = g.inducedSubgraph(Array.from({ length: n }, (_, v) => v)).graph;
          expect([...everything.edges()]).toEqual([...g.edges()]);
          expect(everything.inSources).toEqual(g.inSources);
        },
      ),
    );
  });

  it("matches a naive adjacency model for arbitrary edge lists", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 12 }), edgeList(12), (n, raw) => {
        const pairs = raw.filter(([u, v]) => u < n && v < n);
        const g = Digraph.fromPairs(n, pairs);
        const expected = new Map<string, number>();
        for (const [u, v, w] of pairs)
          expected.set(`${u}>${v}`, (expected.get(`${u}>${v}`) ?? 0) + w);
        expect(g.edgeCount).toBe(expected.size);
        for (const [key, weight] of expected) {
          const [u, v] = key.split(">").map(Number) as [number, number];
          expect(g.weight(u, v)).toBe(weight);
          expect([...g.predecessors(v)]).toContain(u);
        }
        let inTotal = 0;
        for (let v = 0; v < n; v++) {
          const succ = [...g.successors(v)];
          expect(succ).toEqual([...succ].sort((a, b) => a - b));
          inTotal += g.inDegree(v);
        }
        expect(inTotal).toBe(g.edgeCount);
      }),
    );
  });
});

describe("UndirectedGraph", () => {
  it("symmetrizes a directed graph", () => {
    const g = Digraph.fromPairs(3, [
      [0, 1, 2],
      [1, 0, 3],
      [1, 2, 1],
      [2, 2, 4],
    ]).toUndirected();
    expect([...g.neighborsOf(0)]).toEqual([1]);
    expect([...g.neighborsOf(1)]).toEqual([0, 2]);
    expect([...g.neighborsOf(2)]).toEqual([1, 2]);
    expect(g.totalWeight).toBe(10);
    expect(g.strength(0)).toBe(5);
    expect(g.strength(1)).toBe(6);
    // Self-loops count twice towards strength.
    expect(g.strength(2)).toBe(9);
  });

  it("has strengths summing to twice the total weight", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 10 }), edgeList(10), (n, raw) => {
        const pairs = raw.filter(([u, v]) => u < n && v < n);
        const g = UndirectedGraph.fromEdges(
          n,
          pairs.map((p) => p[0]),
          pairs.map((p) => p[1]),
          pairs.map((p) => p[2]),
        );
        let sum = 0;
        for (let v = 0; v < n; v++) sum += g.strength(v);
        expect(sum).toBeCloseTo(2 * g.totalWeight, 9);
      }),
    );
  });
});
