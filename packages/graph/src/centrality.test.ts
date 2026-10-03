import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { betweennessCentrality } from "./centrality.js";
import { Digraph, GraphError } from "./digraph.js";
import { createRandom, sampleWithoutReplacement } from "./random.js";

const graphArb = (maxNodes: number, maxEdges: number) =>
  fc.integer({ min: 0, max: maxNodes }).chain((n) =>
    fc
      .array(fc.tuple(fc.nat(Math.max(0, n - 1)), fc.nat(Math.max(0, n - 1))), {
        maxLength: n === 0 ? 0 : maxEdges,
      })
      .map((pairs) => Digraph.fromPairs(n, pairs)),
  );

/**
 * Reference: Freeman's definition evaluated directly. Distances by Floyd–Warshall; shortest-path counts
 * σ(s, t) by summing over the last edge u→t of a shortest path, in order of distance.
 */
function bruteForceBetweenness(graph: Digraph): number[] {
  const n = graph.nodeCount;
  const inf = Number.POSITIVE_INFINITY;
  const d = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : inf)),
  );
  for (const [u, v] of graph.edges()) if (u !== v) d[u]![v] = 1;
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) d[i]![j] = Math.min(d[i]![j]!, d[i]![k]! + d[k]![j]!);
  const sigma = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let s = 0; s < n; s++) {
    sigma[s]![s] = 1;
    const byDistance = Array.from({ length: n }, (_, t) => t)
      .filter((t) => t !== s && d[s]![t]! < inf)
      .sort((a, b) => d[s]![a]! - d[s]![b]!);
    for (const t of byDistance) {
      for (const u of graph.predecessors(t))
        if (d[s]![u]! + 1 === d[s]![t]) sigma[s]![t]! += sigma[s]![u]!;
    }
  }
  const values = new Array<number>(n).fill(0);
  for (let s = 0; s < n; s++)
    for (let t = 0; t < n; t++) {
      if (s === t || d[s]![t] === inf) continue;
      for (let v = 0; v < n; v++) {
        if (v === s || v === t) continue;
        if (d[s]![v]! + d[v]![t]! === d[s]![t])
          values[v]! += (sigma[s]![v]! * sigma[v]![t]!) / sigma[s]![t]!;
      }
    }
  return values;
}

const expectClose = (actual: Float64Array, expected: readonly number[], digits = 10) => {
  expect(actual.length).toBe(expected.length);
  expected.forEach((value, i) => {
    expect(actual[i]).toBeCloseTo(value, digits);
  });
};

describe("betweennessCentrality", () => {
  it("counts shortest paths through each node", () => {
    const path = Digraph.fromPairs(3, [
      [0, 1],
      [1, 2],
    ]);
    expect([...betweennessCentrality(path, { normalized: false }).values]).toEqual([0, 1, 0]);
    expect([...betweennessCentrality(path).values]).toEqual([0, 0.5, 0]);
    expect(betweennessCentrality(path).exact).toBe(true);
  });

  it("splits credit between equally short paths", () => {
    const diamond = Digraph.fromPairs(4, [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ]);
    expect([...betweennessCentrality(diamond, { normalized: false }).values]).toEqual([
      0, 0.5, 0.5, 0,
    ]);
  });

  it("gives a bidirectional star centre the maximum normalized value", () => {
    const pairs: [number, number][] = [];
    for (let i = 1; i <= 4; i++) pairs.push([i, 0], [0, i]);
    const star = Digraph.fromPairs(5, pairs);
    expect([...betweennessCentrality(star).values]).toEqual([1, 0, 0, 0, 0]);
  });

  it("handles disconnected graphs", () => {
    const twoPaths = Digraph.fromPairs(6, [
      [0, 1],
      [1, 2],
      [3, 4],
      [4, 5],
    ]);
    expect([...betweennessCentrality(twoPaths, { normalized: false }).values]).toEqual([
      0, 1, 0, 0, 1, 0,
    ]);
  });

  it("is zero for tiny graphs and ignores self-loops", () => {
    expect([...betweennessCentrality(Digraph.fromPairs(1, [[0, 0]])).values]).toEqual([0]);
    expect([...betweennessCentrality(Digraph.fromPairs(0, [])).values]).toEqual([]);
    expect([...betweennessCentrality(Digraph.fromPairs(2, [[0, 1]])).values]).toEqual([0, 0]);
    const loops = Digraph.fromPairs(3, [
      [0, 1],
      [1, 1],
      [1, 2],
    ]);
    expect([...betweennessCentrality(loops, { normalized: false }).values]).toEqual([0, 1, 0]);
  });

  it("stays finite and accurate when shortest-path counts exceed the floating-point range", () => {
    // Layers of `width` nodes, each joined to every node of the next layer (with `copies` parallel edges on
    // every other layer, and self-loops in layer 1). A node of layer l lies on 1/width of the shortest paths
    // between the width·l nodes before it and the width·(layers − 1 − l) nodes after it. From a node of the
    // first layer, width^(layers − 2) shortest paths lead to a node of the last: 2^1028 and 3^698, both
    // beyond Number.MAX_VALUE, so the counts of the early sources overflow.
    for (const [width, layers, copies] of [
      [2, 1030, 1],
      [3, 700, 1],
      [2, 1030, 2],
    ] as const) {
      const pairs: [number, number][] = [];
      for (let l = 0; l + 1 < layers; l++) {
        for (let i = 0; i < width; i++) {
          for (let j = 0; j < width; j++) {
            const edge: [number, number] = [l * width + i, (l + 1) * width + j];
            for (let c = 0; c < (l % 2 === 0 ? copies : 1); c++) pairs.push(edge);
          }
        }
      }
      for (let i = 0; i < width; i++) pairs.push([width + i, width + i]);
      const graph = Digraph.fromPairs(width * layers, pairs, { mergeParallelEdges: copies === 1 });
      const { values } = betweennessCentrality(graph, { normalized: false });
      values.forEach((value, v) => {
        const l = Math.floor(v / width);
        const expected = width * l * (layers - 1 - l);
        expect(Math.abs(value - expected)).toBeLessThanOrEqual(1e-9 * expected);
      });
      const sampled = betweennessCentrality(graph, { sample: { pivots: 20, seed: 3 } });
      expect(sampled.values.every(Number.isFinite)).toBe(true);
    }
  });

  it("matches the definition on small graphs", () => {
    fc.assert(
      fc.property(graphArb(9, 30), fc.boolean(), (graph, normalized) => {
        const n = graph.nodeCount;
        const raw = bruteForceBetweenness(graph);
        const scale = normalized ? (n > 2 ? 1 / ((n - 1) * (n - 2)) : 0) : 1;
        const result = betweennessCentrality(graph, { normalized });
        expect(result.exact).toBe(true);
        expectClose(
          result.values,
          raw.map((x) => x * scale),
        );
      }),
      { numRuns: 200 },
    );
  });

  describe("sampling", () => {
    const graph = Digraph.fromPairs(8, [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [1, 4],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [2, 6],
      [6, 1],
    ]);

    it("is exact when pivots cover every node", () => {
      const exact = betweennessCentrality(graph);
      const covered = betweennessCentrality(graph, { sample: { pivots: 8, seed: 1 } });
      expect(covered.exact).toBe(true);
      expect([...covered.values]).toEqual([...exact.values]);
      expect(betweennessCentrality(graph, { sample: { pivots: 100, seed: 1 } }).exact).toBe(true);
    });

    it("is deterministic per seed", () => {
      const a = betweennessCentrality(graph, { sample: { pivots: 3, seed: 5 } });
      const b = betweennessCentrality(graph, { sample: { pivots: 3, seed: 5 } });
      expect(a.exact).toBe(false);
      expect([...a.values]).toEqual([...b.values]);
    });

    it("is unbiased: averaging over every possible pivot gives the exact values", () => {
      // Find one seed per possible single pivot, then average the n estimates.
      const n = graph.nodeCount;
      const seedFor = new Map<number, number>();
      for (let seed = 0; seedFor.size < n; seed++) {
        const pivot = sampleWithoutReplacement(n, 1, createRandom(seed))[0]!;
        if (!seedFor.has(pivot)) seedFor.set(pivot, seed);
      }
      const mean = new Array<number>(n).fill(0);
      for (const seed of seedFor.values()) {
        const { values } = betweennessCentrality(graph, {
          sample: { pivots: 1, seed },
          normalized: false,
        });
        values.forEach((x, v) => (mean[v]! += x / n));
      }
      expectClose(betweennessCentrality(graph, { normalized: false }).values, mean);
    });

    it("rejects invalid options", () => {
      expect(() => betweennessCentrality(graph, { sample: { pivots: 0, seed: 1 } })).toThrow(
        GraphError,
      );
      expect(() => betweennessCentrality(graph, { sample: { pivots: 2.5, seed: 1 } })).toThrow(
        GraphError,
      );
      expect(() => betweennessCentrality(graph, { sample: { pivots: 2, seed: 0.5 } })).toThrow(
        GraphError,
      );
    });
  });
});
