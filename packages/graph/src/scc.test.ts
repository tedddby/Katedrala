import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { topologicalOrder } from "./dag.js";
import { Digraph, GraphError } from "./digraph.js";
import { condensation, isNontrivialComponent, stronglyConnectedComponents } from "./scc.js";

const graphArb = (maxNodes: number, maxEdges: number) =>
  fc.integer({ min: 0, max: maxNodes }).chain((n) =>
    fc
      .array(
        fc.tuple(
          fc.nat(Math.max(0, n - 1)),
          fc.nat(Math.max(0, n - 1)),
          fc.integer({ min: 1, max: 4 }),
        ),
        {
          maxLength: n === 0 ? 0 : maxEdges,
        },
      )
      .map((triples) => Digraph.fromPairs(n, triples)),
  );

/** Reflexive transitive closure as a boolean matrix. */
function closure(graph: Digraph): boolean[][] {
  const n = graph.nodeCount;
  const reach = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j));
  for (const [u, v] of graph.edges()) reach[u]![v] = true;
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      if (reach[i]![k]) for (let j = 0; j < n; j++) if (reach[k]![j]) reach[i]![j] = true;
  return reach;
}

const lists = (components: Int32Array[]) => components.map((c) => [...c]);

describe("stronglyConnectedComponents", () => {
  it("handles the empty graph and a single node", () => {
    const empty = stronglyConnectedComponents(Digraph.fromPairs(0, []));
    expect(empty.count).toBe(0);
    expect(empty.components).toEqual([]);
    const single = stronglyConnectedComponents(Digraph.fromPairs(1, []));
    expect(single.count).toBe(1);
    expect(lists(single.components)).toEqual([[0]]);
    expect([...single.componentOf]).toEqual([0]);
  });

  it("finds cycles and orders components by smallest member", () => {
    const g = Digraph.fromPairs(7, [
      [6, 4],
      [4, 6],
      [0, 6],
      [1, 2],
      [2, 3],
      [3, 1],
      [5, 5],
      [3, 4],
    ]);
    const scc = stronglyConnectedComponents(g);
    expect(scc.count).toBe(4);
    expect(lists(scc.components)).toEqual([[0], [1, 2, 3], [4, 6], [5]]);
    expect([...scc.componentOf]).toEqual([0, 1, 1, 1, 2, 3, 2]);
  });

  it("treats a self-loop as a singleton component", () => {
    const scc = stronglyConnectedComponents(Digraph.fromPairs(2, [[1, 1]]));
    expect(lists(scc.components)).toEqual([[0], [1]]);
  });

  it("groups exactly the mutually reachable nodes, canonically ordered", () => {
    fc.assert(
      fc.property(graphArb(12, 30), (graph) => {
        const scc = stronglyConnectedComponents(graph);
        const reach = closure(graph);
        const n = graph.nodeCount;
        for (let u = 0; u < n; u++) {
          for (let v = 0; v < n; v++) {
            const mutual = reach[u]![v]! && reach[v]![u]!;
            expect(scc.componentOf[u] === scc.componentOf[v]).toBe(mutual);
          }
        }
        expect(scc.components.length).toBe(scc.count);
        let seen = 0;
        scc.components.forEach((members, id) => {
          seen += members.length;
          expect([...members]).toEqual([...members].sort((a, b) => a - b));
          for (const v of members) expect(scc.componentOf[v]).toBe(id);
          if (id > 0) expect(members[0]).toBeGreaterThan(scc.components[id - 1]![0]!);
        });
        expect(seen).toBe(n);
      }),
    );
  });

  it("does not depend on edge input order", () => {
    fc.assert(
      fc.property(
        graphArb(10, 25).chain((g) =>
          fc.tuple(fc.constant(g), fc.shuffledSubarray([...g.edges()], { minLength: g.edgeCount })),
        ),
        ([graph, shuffled]) => {
          const rebuilt = Digraph.fromPairs(graph.nodeCount, shuffled);
          const a = stronglyConnectedComponents(graph);
          const b = stronglyConnectedComponents(rebuilt);
          expect([...b.componentOf]).toEqual([...a.componentOf]);
        },
      ),
    );
  });
});

describe("isNontrivialComponent", () => {
  const g = Digraph.fromPairs(4, [
    [0, 1],
    [1, 0],
    [2, 2],
  ]);
  it("recognizes cycles of length one and more", () => {
    expect(isNontrivialComponent(g, [0, 1])).toBe(true);
    expect(isNontrivialComponent(g, [2])).toBe(true);
    expect(isNontrivialComponent(g, [3])).toBe(false);
    expect(isNontrivialComponent(g, [])).toBe(false);
    const scc = stronglyConnectedComponents(g);
    expect(scc.components.map((members) => isNontrivialComponent(g, members))).toEqual([
      true,
      true,
      false,
    ]);
  });
});

describe("condensation", () => {
  it("sums weights between components and drops internal edges", () => {
    const g = Digraph.fromPairs(5, [
      [0, 1, 1],
      [1, 0, 1],
      [0, 2, 2],
      [1, 2, 3],
      [2, 3, 4],
      [3, 2, 5],
      [3, 3, 6],
      [4, 0, 7],
    ]);
    const scc = stronglyConnectedComponents(g);
    expect(lists(scc.components)).toEqual([[0, 1], [2, 3], [4]]);
    const dag = condensation(g, scc);
    expect(dag.nodeCount).toBe(3);
    expect([...dag.edges()]).toEqual([
      [0, 1, 5],
      [2, 0, 7],
    ]);
  });

  it("handles the empty graph and a single node", () => {
    const empty = Digraph.fromPairs(0, []);
    expect(condensation(empty, stronglyConnectedComponents(empty)).nodeCount).toBe(0);
    const loop = Digraph.fromPairs(1, [[0, 0, 2]]);
    const dag = condensation(loop, stronglyConnectedComponents(loop));
    expect(dag.nodeCount).toBe(1);
    expect(dag.edgeCount).toBe(0);
  });

  it("rejects a mismatched component assignment", () => {
    const g = Digraph.fromPairs(2, [[0, 1]]);
    const other = stronglyConnectedComponents(Digraph.fromPairs(3, []));
    expect(() => condensation(g, other)).toThrow(GraphError);
  });

  it("is an acyclic graph whose edges mirror inter-component edges", () => {
    fc.assert(
      fc.property(graphArb(12, 30), (graph) => {
        const scc = stronglyConnectedComponents(graph);
        const dag = condensation(graph, scc);
        expect(dag.nodeCount).toBe(scc.count);
        expect(() => topologicalOrder(dag)).not.toThrow();
        const expected = new Map<string, number>();
        for (const [u, v, w] of graph.edges()) {
          const cu = scc.componentOf[u]!;
          const cv = scc.componentOf[v]!;
          if (cu !== cv) expected.set(`${cu}>${cv}`, (expected.get(`${cu}>${cv}`) ?? 0) + w);
        }
        expect(dag.edgeCount).toBe(expected.size);
        for (const [a, b, w] of dag.edges()) expect(w).toBe(expected.get(`${a}>${b}`));
      }),
    );
  });
});
