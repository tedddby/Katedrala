import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { longestPathLengths, topologicalOrder } from "./dag.js";
import { Digraph, GraphError } from "./digraph.js";
import type { Direction } from "./traversal.js";

/** Random DAGs: edges go from lower to higher rank under a random permutation of the nodes. */
const dagArb = (maxNodes: number, maxEdges: number) =>
  fc.integer({ min: 0, max: maxNodes }).chain((n) =>
    fc
      .tuple(
        fc.shuffledSubarray(
          Array.from({ length: n }, (_, i) => i),
          { minLength: n, maxLength: n },
        ),
        fc.array(fc.tuple(fc.nat(Math.max(0, n - 1)), fc.nat(Math.max(0, n - 1))), {
          maxLength: n === 0 ? 0 : maxEdges,
        }),
      )
      .map(([rank, pairs]) =>
        Digraph.fromPairs(
          n,
          pairs
            .filter(([a, b]) => a !== b)
            .map(([a, b]): [number, number] =>
              a < b ? [rank[a]!, rank[b]!] : [rank[b]!, rank[a]!],
            ),
        ),
      ),
  );

/** Reference: the lexicographically smallest topological order by repeated linear scans. */
function smallestTopologicalOrder(graph: Digraph): number[] {
  const n = graph.nodeCount;
  const done = new Array<boolean>(n).fill(false);
  const order: number[] = [];
  for (let step = 0; step < n; step++) {
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      if ([...graph.predecessors(v)].every((u) => done[u])) {
        done[v] = true;
        order.push(v);
        break;
      }
    }
  }
  return order;
}

/** Reference: longest path (in edges) from each node by exhaustive DFS. */
function longestByDfs(graph: Digraph, direction: Direction): number[] {
  const next = (v: number) => (direction === "out" ? graph.successors(v) : graph.predecessors(v));
  const longest = (v: number): number => Math.max(0, ...[...next(v)].map((w) => 1 + longest(w)));
  return Array.from({ length: graph.nodeCount }, (_, v) => longest(v));
}

describe("topologicalOrder", () => {
  it("returns the lexicographically smallest order", () => {
    const g = Digraph.fromPairs(6, [
      [5, 0],
      [4, 0],
      [3, 1],
      [2, 3],
      [5, 2],
      [4, 1],
    ]);
    expect([...topologicalOrder(g)]).toEqual([4, 5, 0, 2, 3, 1]);
  });

  it("handles trivial graphs", () => {
    expect([...topologicalOrder(Digraph.fromPairs(0, []))]).toEqual([]);
    expect([...topologicalOrder(Digraph.fromPairs(3, []))]).toEqual([0, 1, 2]);
  });

  it("throws on cycles and self-loops", () => {
    expect(() => topologicalOrder(Digraph.fromPairs(1, [[0, 0]]))).toThrow(GraphError);
    expect(() =>
      topologicalOrder(
        Digraph.fromPairs(4, [
          [0, 1],
          [1, 2],
          [2, 1],
          [2, 3],
        ]),
      ),
    ).toThrow(/smallest is 1/);
  });

  it("counts parallel edges correctly", () => {
    const g = Digraph.fromPairs(
      2,
      [
        [1, 0],
        [1, 0],
      ],
      { mergeParallelEdges: false },
    );
    expect([...topologicalOrder(g)]).toEqual([1, 0]);
  });

  it("is a valid order equal to the smallest reference order", () => {
    fc.assert(
      fc.property(dagArb(12, 30), (dag) => {
        const order = [...topologicalOrder(dag)];
        expect([...order].sort((a, b) => a - b)).toEqual(
          Array.from({ length: dag.nodeCount }, (_, i) => i),
        );
        const position = new Map(order.map((v, i) => [v, i]));
        for (const [u, v] of dag.edges()) expect(position.get(u)!).toBeLessThan(position.get(v)!);
        expect(order).toEqual(smallestTopologicalOrder(dag));
      }),
    );
  });
});

describe("longestPathLengths", () => {
  const g = Digraph.fromPairs(6, [
    [0, 1],
    [1, 2],
    [0, 2],
    [2, 3],
    [4, 3],
  ]);

  it("measures dependency depth in both directions", () => {
    expect([...longestPathLengths(g)]).toEqual([3, 2, 1, 0, 1, 0]);
    expect([...longestPathLengths(g, "in")]).toEqual([0, 1, 2, 3, 0, 0]);
    expect([...longestPathLengths(Digraph.fromPairs(0, []))]).toEqual([]);
    expect([...longestPathLengths(Digraph.fromPairs(1, []), "in")]).toEqual([0]);
  });

  it("throws on cycles", () => {
    expect(() => longestPathLengths(Digraph.fromPairs(1, [[0, 0]]))).toThrow(GraphError);
    expect(() =>
      longestPathLengths(
        Digraph.fromPairs(2, [
          [0, 1],
          [1, 0],
        ]),
      ),
    ).toThrow(GraphError);
  });

  it("matches exhaustive search on small DAGs", () => {
    fc.assert(
      fc.property(dagArb(9, 20), fc.constantFrom<Direction>("out", "in"), (dag, direction) => {
        expect([...longestPathLengths(dag, direction)]).toEqual(longestByDfs(dag, direction));
      }),
    );
  });
});
