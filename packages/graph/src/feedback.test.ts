import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { topologicalOrder } from "./dag.js";
import { Digraph } from "./digraph.js";
import { greedyFeedbackArcSet } from "./feedback.js";
import { stronglyConnectedComponents } from "./scc.js";

const graphArb = (maxNodes: number, maxEdges: number) =>
  fc.integer({ min: 0, max: maxNodes }).chain((n) =>
    fc
      .array(fc.tuple(fc.nat(Math.max(0, n - 1)), fc.nat(Math.max(0, n - 1))), {
        maxLength: n === 0 ? 0 : maxEdges,
      })
      .map((pairs) => Digraph.fromPairs(n, pairs)),
  );

/** The graph without the given arcs (one copy removed per listed arc). */
function without(graph: Digraph, arcs: Array<[number, number]>): Digraph {
  const remaining = new Map<string, number>();
  for (const [u, v] of arcs) remaining.set(`${u}>${v}`, (remaining.get(`${u}>${v}`) ?? 0) + 1);
  const kept: [number, number][] = [];
  for (const [u, v] of graph.edges()) {
    const key = `${u}>${v}`;
    const count = remaining.get(key) ?? 0;
    if (count > 0) remaining.set(key, count - 1);
    else kept.push([u, v]);
  }
  return Digraph.fromPairs(graph.nodeCount, kept, { mergeParallelEdges: false });
}

describe("greedyFeedbackArcSet", () => {
  it("is empty for DAGs and the empty graph", () => {
    expect(greedyFeedbackArcSet(Digraph.fromPairs(0, []))).toEqual([]);
    const dag = Digraph.fromPairs(4, [
      [0, 1],
      [1, 2],
      [0, 2],
      [3, 1],
    ]);
    expect(greedyFeedbackArcSet(dag)).toEqual([]);
  });

  it("always includes self-loops", () => {
    expect(
      greedyFeedbackArcSet(
        Digraph.fromPairs(3, [
          [1, 1],
          [0, 1],
        ]),
      ),
    ).toEqual([[1, 1]]);
    expect(greedyFeedbackArcSet(Digraph.fromPairs(1, [[0, 0]]))).toEqual([[0, 0]]);
    expect(greedyFeedbackArcSet(Digraph.fromPairs(1, []))).toEqual([]);
  });

  it("breaks a 2-cycle and a long cycle with one arc each", () => {
    expect(
      greedyFeedbackArcSet(
        Digraph.fromPairs(2, [
          [0, 1],
          [1, 0],
        ]),
      ),
    ).toEqual([[1, 0]]);
    const ring: [number, number][] = Array.from({ length: 50 }, (_, i) => [i, (i + 1) % 50]);
    expect(greedyFeedbackArcSet(Digraph.fromPairs(50, ring))).toHaveLength(1);
  });

  it("never removes edges between strongly connected components", () => {
    // Two triangles joined by a bridge in each direction would merge them; one bridge keeps them apart.
    const g = Digraph.fromPairs(6, [
      [0, 1],
      [1, 2],
      [2, 0],
      [3, 4],
      [4, 5],
      [5, 3],
      [2, 3],
    ]);
    const arcs = greedyFeedbackArcSet(g);
    expect(arcs).toHaveLength(2);
    expect(arcs).not.toContainEqual([2, 3]);
  });

  it("lists every backward copy of parallel edges", () => {
    const g = Digraph.fromPairs(
      2,
      [
        [0, 1],
        [1, 0],
        [1, 0],
      ],
      { mergeParallelEdges: false },
    );
    const arcs = greedyFeedbackArcSet(g);
    expect(() => topologicalOrder(without(g, arcs))).not.toThrow();
  });

  it("leaves an acyclic graph, lists real edges in sorted order and respects the half bound", () => {
    fc.assert(
      fc.property(graphArb(12, 40), (graph) => {
        const arcs = greedyFeedbackArcSet(graph);
        for (const [u, v] of arcs) expect(graph.hasEdge(u, v)).toBe(true);
        const keys = arcs.map(([u, v]) => u * 1000 + v);
        expect(keys).toEqual([...keys].sort((a, b) => a - b));
        expect(new Set(keys).size).toBe(keys.length);
        expect(() => topologicalOrder(without(graph, arcs))).not.toThrow();
        const { componentOf } = stronglyConnectedComponents(graph);
        let selfLoops = 0;
        let internal = 0;
        for (const [u, v] of graph.edges()) {
          if (u === v) selfLoops++;
          else if (componentOf[u] === componentOf[v]) internal++;
        }
        expect(arcs.filter(([u, v]) => u === v)).toHaveLength(selfLoops);
        expect(arcs.length - selfLoops).toBeLessThanOrEqual(Math.floor(internal / 2));
      }),
    );
  });

  it("does not depend on edge input order", () => {
    fc.assert(
      fc.property(
        graphArb(10, 30).chain((g) =>
          fc.tuple(fc.constant(g), fc.shuffledSubarray([...g.edges()], { minLength: g.edgeCount })),
        ),
        ([graph, shuffled]) => {
          expect(greedyFeedbackArcSet(Digraph.fromPairs(graph.nodeCount, shuffled))).toEqual(
            greedyFeedbackArcSet(graph),
          );
        },
      ),
    );
  });
});
