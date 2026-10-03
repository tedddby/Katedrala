import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { louvain, modularity } from "./clustering.js";
import { GraphError, UndirectedGraph } from "./digraph.js";
import { createRandom } from "./random.js";

type Edge = readonly [number, number, number];

const build = (n: number, edges: readonly Edge[]) =>
  UndirectedGraph.fromEdges(
    n,
    edges.map((e) => e[0]),
    edges.map((e) => e[1]),
    edges.map((e) => e[2]),
  );

const edgesArb = (n: number, maxEdges: number) =>
  fc.array(
    fc.tuple(
      fc.nat(Math.max(0, n - 1)),
      fc.nat(Math.max(0, n - 1)),
      fc.integer({ min: 1, max: 5 }),
    ),
    {
      maxLength: n === 0 ? 0 : maxEdges,
    },
  );

const graphArb = (maxNodes: number, maxEdges: number) =>
  fc
    .integer({ min: 0, max: maxNodes })
    .chain((n) => edgesArb(n, maxEdges).map((edges) => build(n, edges)));

/** Reference: modularity by the dense double sum over all node pairs. */
function denseModularity(
  graph: UndirectedGraph,
  communities: ArrayLike<number>,
  resolution: number,
): number {
  const n = graph.nodeCount;
  const twoM = 2 * graph.totalWeight;
  if (twoM === 0) return 0;
  const a = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let e = graph.offsets[i]!; e < graph.offsets[i + 1]!; e++) {
      const j = graph.neighbors[e]!;
      a[i]![j] = (i === j ? 2 : 1) * graph.weights[e]!;
    }
  }
  const k = a.map((row) => row.reduce((s, x) => s + x, 0));
  let q = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (communities[i] === communities[j]) q += a[i]![j]! - (resolution * k[i]! * k[j]!) / twoM;
    }
  return q / twoM;
}

/** Ring of `cliques` cliques of `size` nodes; clique c holds nodes c·size .. c·size + size − 1. */
function ringOfCliques(cliques: number, size: number): Edge[] {
  const edges: Edge[] = [];
  for (let c = 0; c < cliques; c++) {
    const base = c * size;
    for (let i = 0; i < size; i++)
      for (let j = i + 1; j < size; j++) edges.push([base + i, base + j, 1]);
    edges.push([base + size - 1, ((c + 1) % cliques) * size, 1]);
  }
  return edges;
}

/** Labels renumbered 0..k−1 by first appearance. */
const canonical = (labels: ArrayLike<number>): number[] => {
  const ids = new Map<number, number>();
  return Array.from(labels, (label) => {
    if (!ids.has(label)) ids.set(label, ids.size);
    return ids.get(label)!;
  });
};

/** Whether every community induces a connected subgraph. */
function communitiesConnected(graph: UndirectedGraph, communities: Int32Array): boolean {
  const n = graph.nodeCount;
  const seen = new Uint8Array(n);
  const starts = new Set<number>();
  for (let root = 0; root < n; root++) {
    if (seen[root] === 1) continue;
    if (starts.has(communities[root]!)) return false;
    starts.add(communities[root]!);
    const stack = [root];
    seen[root] = 1;
    while (stack.length > 0) {
      const v = stack.pop()!;
      for (const w of graph.neighborsOf(v)) {
        if (seen[w] === 1 || communities[w] !== communities[v]) continue;
        seen[w] = 1;
        stack.push(w);
      }
    }
  }
  return true;
}

describe("modularity", () => {
  const twoEdges = build(4, [
    [0, 1, 1],
    [2, 3, 1],
  ]);

  it("evaluates hand-checked partitions", () => {
    expect(modularity(twoEdges, [0, 0, 1, 1])).toBe(0.5);
    expect(modularity(twoEdges, [7, 7, 7, 7])).toBe(0);
    expect(modularity(twoEdges, [0, 1, 2, 3])).toBe(-0.25);
    expect(modularity(twoEdges, [0, 0, 1, 1], 2)).toBe(0);
    expect(modularity(build(3, []), [0, 1, 2])).toBe(0);
    expect(modularity(build(1, [[0, 0, 3]]), [0])).toBe(0);
    expect(modularity(build(0, []), [])).toBe(0);
  });

  it("counts self-loops twice in A_ii and in the degree", () => {
    const g = build(2, [
      [0, 1, 1],
      [0, 0, 1],
    ]);
    expect(modularity(g, [0, 1])).toBeCloseTo(-0.125, 15);
    expect(modularity(g, [0, 0])).toBe(0);
  });

  it("accepts arbitrary integer labels", () => {
    expect(modularity(twoEdges, [-5, -5, 1e9, 1e9])).toBe(0.5);
  });

  it("rejects invalid partitions", () => {
    expect(() => modularity(twoEdges, [0, 0, 1])).toThrow(GraphError);
    expect(() => modularity(twoEdges, [0, 0, 1, 0.5])).toThrow(GraphError);
  });

  it("matches the dense definition", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }).chain((n) =>
          fc.tuple(
            edgesArb(n, 30).map((edges) => build(n, edges)),
            fc.array(fc.integer({ min: 0, max: 3 }), { minLength: n, maxLength: n }),
          ),
        ),
        fc.double({ min: 0, max: 3, noNaN: true }),
        ([graph, communities], resolution) => {
          expect(modularity(graph, communities, resolution)).toBeCloseTo(
            denseModularity(graph, communities, resolution),
            12,
          );
        },
      ),
    );
  });
});

describe("louvain", () => {
  it("handles empty and edgeless graphs", () => {
    expect(louvain(build(0, []))).toEqual({
      communities: new Int32Array(0),
      count: 0,
      modularity: 0,
      levels: 0,
    });
    expect(louvain(build(3, []))).toEqual({
      communities: Int32Array.from([0, 1, 2]),
      count: 3,
      modularity: 0,
      levels: 0,
    });
  });

  it("handles a single node with a self-loop", () => {
    expect(louvain(build(1, [[0, 0, 2]]))).toEqual({
      communities: Int32Array.from([0]),
      count: 1,
      modularity: 0,
      levels: 1,
    });
  });

  it("recovers planted cliques exactly", () => {
    const edges = ringOfCliques(4, 8);
    const graph = build(32, edges);
    const result = louvain(graph);
    const planted = Array.from({ length: 32 }, (_, v) => Math.floor(v / 8));
    expect([...result.communities]).toEqual(planted);
    expect(result.count).toBe(4);
    expect(result.modularity).toBeCloseTo(modularity(graph, planted), 15);
  });

  it("recovers planted cliques under a node relabelling", () => {
    const random = createRandom(31);
    const permutation = Array.from({ length: 32 }, (_, i) => i);
    for (let i = 31; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [permutation[i], permutation[j]] = [permutation[j]!, permutation[i]!];
    }
    const edges = ringOfCliques(4, 8).map(
      ([u, v, w]) => [permutation[u]!, permutation[v]!, w] as const,
    );
    const planted = new Array<number>(32);
    for (let v = 0; v < 32; v++) planted[permutation[v]!] = Math.floor(v / 8);
    const result = louvain(build(32, edges));
    expect([...result.communities]).toEqual(canonical(planted));
  });

  it("is deterministic across runs and edge input orders", () => {
    fc.assert(
      fc.property(
        fc
          .integer({ min: 1, max: 25 })
          .chain((n) =>
            edgesArb(n, 60).chain((edges) =>
              fc.tuple(
                fc.constant(n),
                fc.constant(edges),
                fc.shuffledSubarray(edges, { minLength: edges.length }),
              ),
            ),
          ),
        ([n, edges, shuffled]) => {
          const a = louvain(build(n, edges));
          const b = louvain(build(n, edges));
          const c = louvain(build(n, shuffled));
          expect(b).toEqual(a);
          expect(c).toEqual(a);
        },
      ),
    );
  });

  it("produces valid, connected, canonically numbered communities that beat singletons", () => {
    fc.assert(
      fc.property(
        graphArb(30, 70),
        fc.double({ min: 0.2, max: 2, noNaN: true }),
        (graph, resolution) => {
          const n = graph.nodeCount;
          const result = louvain(graph, { resolution });
          expect(result.communities.length).toBe(n);
          expect(canonical(result.communities)).toEqual([...result.communities]);
          expect(result.count).toBe(n === 0 ? 0 : Math.max(...result.communities) + 1);
          expect(communitiesConnected(graph, result.communities)).toBe(true);
          expect(result.modularity).toBe(modularity(graph, result.communities, resolution));
          const singletons = Array.from({ length: n }, (_, v) => v);
          expect(result.modularity).toBeGreaterThanOrEqual(
            modularity(graph, singletons, resolution) - 1e-12,
          );
        },
      ),
    );
  });

  it("never ends below its warm start", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }).chain((n) =>
          fc.tuple(
            edgesArb(n, 50).map((edges) => build(n, edges)),
            fc.array(fc.integer({ min: 0, max: 4 }), { minLength: n, maxLength: n }),
          ),
        ),
        ([graph, initialCommunities]) => {
          const result = louvain(graph, { initialCommunities });
          expect(result.modularity).toBeGreaterThanOrEqual(
            modularity(graph, initialCommunities) - 1e-12,
          );
        },
      ),
    );
  });

  it("honours a warm start", () => {
    const graph = build(32, ringOfCliques(4, 8));
    // Pairs of adjacent cliques: a poorer local optimum that local moving alone does not leave.
    const pairs = Array.from({ length: 32 }, (_, v) => (v < 16 ? 10 : 20));
    const kept = louvain(graph, { initialCommunities: pairs, maxLevels: 1, maxPasses: 0 });
    expect([...kept.communities]).toEqual(canonical(pairs));
    expect(kept.levels).toBe(1);
    const planted = Array.from({ length: 32 }, (_, v) => Math.floor(v / 8));
    expect([...louvain(graph, { initialCommunities: planted }).communities]).toEqual(planted);
    // Without limits, Louvain starts from the warm start: it never splits a community, so it stays in this
    // local optimum, unlike the cold start, which finds the four cliques.
    const warm = louvain(graph, { initialCommunities: pairs });
    expect([...warm.communities]).toEqual(canonical(pairs));
    expect(warm.modularity).toBeLessThan(louvain(graph).modularity);
  });

  it("splits disconnected warm-start communities", () => {
    const graph = build(4, [
      [0, 1, 1],
      [2, 3, 1],
    ]);
    const result = louvain(graph, { initialCommunities: [0, 1, 0, 1], maxLevels: 0 });
    expect([...result.communities]).toEqual([0, 1, 2, 3]);
    expect(result.levels).toBe(0);
  });

  it("merges each connected component at resolution 0", () => {
    const graph = build(32, ringOfCliques(4, 8));
    const result = louvain(graph, { resolution: 0 });
    expect(result.count).toBe(1);
    expect(result.modularity).toBe(1);
  });

  it("handles self-loops", () => {
    const graph = build(4, [
      [0, 0, 5],
      [0, 1, 1],
      [1, 1, 5],
      [2, 3, 1],
      [3, 3, 1],
    ]);
    const result = louvain(graph);
    expect(result.modularity).toBe(modularity(graph, result.communities));
    expect(result.modularity).toBeGreaterThanOrEqual(modularity(graph, [0, 1, 2, 3]));
  });

  it("limits levels and passes", () => {
    const graph = build(32, ringOfCliques(4, 8));
    const oneLevel = louvain(graph, { maxLevels: 1 });
    expect(oneLevel.levels).toBe(1);
    expect(oneLevel.modularity).toBeLessThanOrEqual(louvain(graph).modularity);
    const none = louvain(graph, { maxLevels: 0 });
    expect(none.levels).toBe(0);
    expect(none.count).toBe(32);
  });

  it("can iterate until no node moves", () => {
    fc.assert(
      fc.property(graphArb(25, 60), (graph) => {
        const exhaustive = louvain(graph, { minPassGain: 0 });
        expect(communitiesConnected(graph, exhaustive.communities)).toBe(true);
        expect(exhaustive).toEqual(louvain(graph, { minPassGain: 0 }));
        expect(exhaustive.modularity).toBe(modularity(graph, exhaustive.communities));
      }),
    );
  });

  it("rejects invalid options", () => {
    const graph = build(2, [[0, 1, 1]]);
    expect(() => louvain(graph, { minPassGain: -1 })).toThrow(GraphError);
    expect(() => louvain(build(2, [[0, 1, -1]]))).toThrow(GraphError);
    expect(() => louvain(graph, { resolution: -1 })).toThrow(GraphError);
    expect(() => louvain(graph, { resolution: Number.NaN })).toThrow(GraphError);
    expect(() => louvain(graph, { maxLevels: -1 })).toThrow(GraphError);
    expect(() => louvain(graph, { maxPasses: 1.5 })).toThrow(GraphError);
    expect(() => louvain(graph, { minModularityGain: -1 })).toThrow(GraphError);
    expect(() => louvain(graph, { initialCommunities: [0] })).toThrow(GraphError);
  });
});
