import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { elementaryCycles, shortestCycleThrough } from "./cycles.js";
import { Digraph, GraphError } from "./digraph.js";
import { createRandom } from "./random.js";

const graphArb = (maxNodes: number, maxEdges: number, mergeParallelEdges = true) =>
  fc.integer({ min: 0, max: maxNodes }).chain((n) =>
    fc
      .array(fc.tuple(fc.nat(Math.max(0, n - 1)), fc.nat(Math.max(0, n - 1))), {
        maxLength: n === 0 ? 0 : maxEdges,
      })
      .map((pairs) => Digraph.fromPairs(n, pairs, { mergeParallelEdges })),
  );

function lexicographic(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

/**
 * Reference: every elementary cycle of at most `maxLength` nodes once, starting at its smallest node, by
 * exhaustive path search.
 */
function bruteForceCycles(graph: Digraph, maxLength = Number.POSITIVE_INFINITY): number[][] {
  const n = graph.nodeCount;
  const cycles: number[][] = [];
  const path: number[] = [];
  const onPath = new Array<boolean>(n).fill(false);
  const extend = (start: number, v: number): void => {
    for (const w of new Set(graph.successors(v))) {
      if (w === start) cycles.push([...path]);
      else if (w > start && !onPath[w] && path.length < maxLength) {
        path.push(w);
        onPath[w] = true;
        extend(start, w);
        path.pop();
        onPath[w] = false;
      }
    }
  };
  for (let s = 0; s < n; s++) {
    path.push(s);
    onPath[s] = true;
    extend(s, s);
    path.pop();
    onPath[s] = false;
  }
  return cycles.sort(lexicographic);
}

/** Reference: length (in edges) of the shortest cycle through `node`, by Floyd–Warshall. */
function shortestCycleLength(graph: Digraph, node: number): number {
  const n = graph.nodeCount;
  const d = Array.from({ length: n }, () => new Array<number>(n).fill(Number.POSITIVE_INFINITY));
  for (const [u, v] of graph.edges()) d[u]![v] = 1;
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) d[i]![j] = Math.min(d[i]![j]!, d[i]![k]! + d[k]![j]!);
  return d[node]![node]!;
}

/**
 * Reference for large graphs: the first `limit` elementary cycles of at most `maxLength` nodes in
 * lexicographic order, by exhaustive path search from every start s in ascending order, pruned where the
 * distance back to s (among the nodes >= s, ignoring the path) exceeds the remaining length.
 */
function prunedBruteForceCycles(graph: Digraph, maxLength: number, limit: number): number[][] {
  const n = graph.nodeCount;
  const cycles: number[][] = [];
  const path: number[] = [];
  const onPath = new Array<boolean>(n).fill(false);
  const distance = new Array<number>(n);
  const extend = (start: number, v: number): void => {
    for (const w of new Set(graph.successors(v))) {
      if (cycles.length === limit) return;
      if (w === start) cycles.push([...path]);
      else if (w > start && !onPath[w] && path.length + distance[w]! <= maxLength) {
        path.push(w);
        onPath[w] = true;
        extend(start, w);
        path.pop();
        onPath[w] = false;
      }
    }
  };
  for (let s = 0; s < n && cycles.length < limit; s++) {
    distance.fill(Number.POSITIVE_INFINITY);
    distance[s] = 0;
    const queue = [s];
    for (let head = 0; head < queue.length; head++) {
      const v = queue[head]!;
      for (const u of graph.predecessors(v)) {
        if (u > s && distance[u] === Number.POSITIVE_INFINITY) {
          distance[u] = distance[v]! + 1;
          queue.push(u);
        }
      }
    }
    path.push(s);
    onPath[s] = true;
    extend(s, s);
    path.pop();
    onPath[s] = false;
  }
  return cycles;
}

/**
 * A ladder of `rungs` rungs: 0 → {x1, y1} → … → {xK, yK} → t1 → … → t5 → 0 with xj = 2j − 1, yj = 2j and
 * ti = 2K + i, both nodes of every rung joined to both nodes of the next. 2^j paths lead from 0 to rung j;
 * the 2^K elementary cycles all have K + 6 nodes.
 */
function ladder(rungs: number): Digraph {
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
  ];
  for (let j = 1; j < rungs; j++) {
    for (const a of [2 * j - 1, 2 * j]) pairs.push([a, 2 * j + 1], [a, 2 * j + 2]);
  }
  pairs.push([2 * rungs - 1, 2 * rungs + 1], [2 * rungs, 2 * rungs + 1]);
  for (let i = 1; i < 5; i++) pairs.push([2 * rungs + i, 2 * rungs + i + 1]);
  pairs.push([2 * rungs + 5, 0]);
  return Digraph.fromPairs(2 * rungs + 6, pairs);
}

/** Cycle `k` (from 0) of {@link ladder} in lexicographic order: rung j takes yj iff bit K − j of k is set. */
function ladderCycle(rungs: number, k: number): number[] {
  const cycle = [0];
  for (let j = 1; j <= rungs; j++) cycle.push(2 * j - 1 + (Math.floor(k / 2 ** (rungs - j)) % 2));
  for (let i = 1; i <= 5; i++) cycle.push(2 * rungs + i);
  return cycle;
}

/**
 * A layered dependency graph: `layers` layers of `width` nodes (node l·width + i), `degree` random edges from
 * every node to the next layer and `backEdges` random edges from the last layer to the first, so every cycle
 * has at least `layers` nodes.
 */
function layered(seed: number, layers: number, width: number, degree: number, backEdges: number) {
  const random = createRandom(seed);
  const pick = () => Math.floor(random() * width);
  const pairs: [number, number][] = [];
  for (let l = 0; l + 1 < layers; l++) {
    for (let i = 0; i < width; i++) {
      for (let k = 0; k < degree; k++) pairs.push([l * width + i, (l + 1) * width + pick()]);
    }
  }
  for (let k = 0; k < backEdges; k++) pairs.push([(layers - 1) * width + pick(), pick()]);
  return Digraph.fromPairs(layers * width, pairs);
}

describe("shortestCycleThrough", () => {
  const g = Digraph.fromPairs(7, [
    [0, 1],
    [1, 2],
    [2, 0],
    [1, 3],
    [3, 0],
    [2, 4],
    [4, 5],
    [5, 2],
    [6, 6],
  ]);

  it("finds a shortest cycle starting at the node", () => {
    expect(shortestCycleThrough(g, 0)).toEqual([0, 1, 2]);
    expect(shortestCycleThrough(g, 3)).toEqual([3, 0, 1]);
    expect(shortestCycleThrough(g, 4)).toEqual([4, 5, 2]);
    expect(shortestCycleThrough(g, 6)).toEqual([6]);
    expect(shortestCycleThrough(Digraph.fromPairs(2, [[0, 1]]), 0)).toBeUndefined();
    expect(shortestCycleThrough(Digraph.fromPairs(1, []), 0)).toBeUndefined();
    expect(() => shortestCycleThrough(g, 7)).toThrow(GraphError);
  });

  it("returns a valid cycle of minimum length", () => {
    fc.assert(
      fc.property(
        graphArb(9, 25).filter((graph) => graph.nodeCount > 0),
        fc.nat(8),
        (graph, raw) => {
          const node = raw % graph.nodeCount;
          const expected = shortestCycleLength(graph, node);
          const cycle = shortestCycleThrough(graph, node);
          if (expected === Number.POSITIVE_INFINITY) {
            expect(cycle).toBeUndefined();
            return;
          }
          expect(cycle).toBeDefined();
          expect(cycle!.length).toBe(expected);
          expect(cycle![0]).toBe(node);
          expect(new Set(cycle).size).toBe(cycle!.length);
          for (let i = 0; i < cycle!.length; i++) {
            expect(graph.hasEdge(cycle![i]!, cycle![(i + 1) % cycle!.length]!)).toBe(true);
          }
        },
      ),
    );
  });
});

describe("elementaryCycles", () => {
  it("lists cycles from their smallest node in lexicographic order", () => {
    const g = Digraph.fromPairs(5, [
      [0, 1],
      [1, 0],
      [1, 2],
      [2, 0],
      [2, 2],
      [3, 4],
      [4, 3],
    ]);
    expect(elementaryCycles(g, { maxCycles: 100 })).toEqual({
      cycles: [[0, 1], [0, 1, 2], [2], [3, 4]],
      truncated: false,
    });
  });

  it("handles graphs without cycles and single nodes", () => {
    expect(elementaryCycles(Digraph.fromPairs(0, []), { maxCycles: 10 })).toEqual({
      cycles: [],
      truncated: false,
    });
    expect(elementaryCycles(Digraph.fromPairs(1, []), { maxCycles: 10 }).cycles).toEqual([]);
    expect(elementaryCycles(Digraph.fromPairs(1, [[0, 0]]), { maxCycles: 10 }).cycles).toEqual([
      [0],
    ]);
    const dag = Digraph.fromPairs(3, [
      [0, 1],
      [1, 2],
      [0, 2],
    ]);
    expect(elementaryCycles(dag, { maxCycles: 10 })).toEqual({ cycles: [], truncated: false });
  });

  it("counts the cycles of a complete graph", () => {
    const pairs: [number, number][] = [];
    for (let u = 0; u < 5; u++) for (let v = 0; v < 5; v++) pairs.push([u, v]);
    const complete = Digraph.fromPairs(5, pairs);
    // 5 self-loops + C(5,2)·1! + C(5,3)·2! + C(5,4)·3! + C(5,5)·4! = 5 + 10 + 20 + 30 + 24.
    expect(elementaryCycles(complete, { maxCycles: 1000 }).cycles.length).toBe(89);
    expect(elementaryCycles(complete, { maxCycles: 1000, maxLength: 2 }).cycles.length).toBe(15);
    expect(elementaryCycles(complete, { maxCycles: 1000, maxLength: 1 }).cycles).toEqual([
      [0],
      [1],
      [2],
      [3],
      [4],
    ]);
  });

  it("truncates to a prefix and reports it", () => {
    const pairs: [number, number][] = [];
    for (let u = 0; u < 4; u++) for (let v = 0; v < 4; v++) if (u !== v) pairs.push([u, v]);
    const complete = Digraph.fromPairs(4, pairs);
    const all = elementaryCycles(complete, { maxCycles: Number.POSITIVE_INFINITY });
    expect(all.cycles.length).toBe(20);
    expect(all.truncated).toBe(false);
    expect(elementaryCycles(complete, { maxCycles: 20 }).truncated).toBe(false);
    const some = elementaryCycles(complete, { maxCycles: 7 });
    expect(some.truncated).toBe(true);
    expect(some.cycles).toEqual(all.cycles.slice(0, 7));
    expect(elementaryCycles(complete, { maxCycles: 0 })).toEqual({ cycles: [], truncated: true });
  });

  it("ignores parallel edges", () => {
    const g = Digraph.fromPairs(
      2,
      [
        [0, 1],
        [0, 1],
        [1, 0],
        [1, 1],
        [1, 1],
      ],
      { mergeParallelEdges: false },
    );
    expect(elementaryCycles(g, { maxCycles: 10 }).cycles).toEqual([[0, 1], [1]]);
    expect(elementaryCycles(g, { maxCycles: 10, maxLength: 1 }).cycles).toEqual([[1]]);
  });

  it("rejects invalid options", () => {
    const g = Digraph.fromPairs(1, []);
    expect(() => elementaryCycles(g, { maxCycles: -1 })).toThrow(GraphError);
    expect(() => elementaryCycles(g, { maxCycles: 1.5 })).toThrow(GraphError);
    expect(() => elementaryCycles(g, { maxCycles: 1, maxLength: 0 })).toThrow(GraphError);
  });

  it("matches brute-force enumeration exactly, in order", () => {
    fc.assert(
      fc.property(graphArb(7, 16), (graph) => {
        const expected = bruteForceCycles(graph);
        expect(elementaryCycles(graph, { maxCycles: Number.POSITIVE_INFINITY })).toEqual({
          cycles: expected,
          truncated: false,
        });
      }),
      { numRuns: 300 },
    );
  });

  it("matches brute force with a length bound", () => {
    fc.assert(
      fc.property(graphArb(7, 18), fc.integer({ min: 1, max: 7 }), (graph, maxLength) => {
        const expected = bruteForceCycles(graph).filter((cycle) => cycle.length <= maxLength);
        expect(elementaryCycles(graph, { maxCycles: Number.POSITIVE_INFINITY, maxLength })).toEqual(
          {
            cycles: expected,
            truncated: false,
          },
        );
      }),
      { numRuns: 500 },
    );
  });

  it("returns the first maxCycles cycles of the full enumeration", () => {
    fc.assert(
      fc.property(
        graphArb(6, 14),
        fc.nat(12),
        fc.integer({ min: 1, max: 6 }),
        (graph, maxCycles, maxLength) => {
          const all = bruteForceCycles(graph).filter((cycle) => cycle.length <= maxLength);
          const result = elementaryCycles(graph, { maxCycles, maxLength });
          expect(result.cycles).toEqual(all.slice(0, maxCycles));
          expect(result.truncated).toBe(all.length > maxCycles);
        },
      ),
    );
  });

  it("agrees with shortestCycleThrough on the shortest cycle length", () => {
    fc.assert(
      fc.property(graphArb(7, 16), (graph) => {
        const { cycles } = elementaryCycles(graph, { maxCycles: Number.POSITIVE_INFINITY });
        for (let v = 0; v < graph.nodeCount; v++) {
          const lengths = cycles.filter((c) => c.includes(v)).map((c) => c.length);
          const shortest = shortestCycleThrough(graph, v);
          expect(shortest?.length).toBe(lengths.length === 0 ? undefined : Math.min(...lengths));
        }
      }),
    );
  });
});

// Strongly connected components with more nodes than maxLength use the length-bounded search.
describe("elementaryCycles with a length bound", () => {
  it("never enters a node again at the same depth, so a search without cycles is polynomial", () => {
    // 2^40 paths lead through the rungs and none closes a cycle of at most 42 nodes. A search that may enter
    // a node again at the depth it last failed at walks all of them (about 2^40 steps).
    const graph = ladder(40);
    expect(elementaryCycles(graph, { maxCycles: Number.POSITIVE_INFINITY, maxLength: 42 })).toEqual(
      { cycles: [], truncated: false },
    );
    expect(elementaryCycles(graph, { maxCycles: 10, maxLength: 45 })).toEqual({
      cycles: [],
      truncated: false,
    });
  });

  it("enumerates exponentially many cycles in lexicographic order", () => {
    const result = elementaryCycles(ladder(40), { maxCycles: 1000, maxLength: 46 });
    expect(result.truncated).toBe(true);
    expect(result.cycles).toEqual(Array.from({ length: 1000 }, (_, k) => ladderCycle(40, k)));
    const small = elementaryCycles(ladder(6), {
      maxCycles: Number.POSITIVE_INFINITY,
      maxLength: 12,
    });
    expect(small).toEqual({
      cycles: Array.from({ length: 64 }, (_, k) => ladderCycle(6, k)),
      truncated: false,
    });
  });

  it("stays polynomial on layered dependency graphs", () => {
    // 960 nodes, 24 layers: every cycle passes through all layers, so none has at most 18 nodes.
    const graph = layered(7, 24, 40, 3, 5);
    expect(elementaryCycles(graph, { maxCycles: 1000, maxLength: 18 })).toEqual({
      cycles: [],
      truncated: false,
    });
    const result = elementaryCycles(graph, { maxCycles: 300, maxLength: 25 });
    expect(result.truncated).toBe(true);
    expect(result.cycles).toEqual(prunedBruteForceCycles(graph, 25, 300));
  });

  it("finds cycles through a node whose shorter way back was blocked by the stack", () => {
    // From 0, node 2 is first entered below 1, which blocks its way back 2 → 1 → 0, and reaches 0 in 4
    // edges through 3, 4, 5. Gupta & Suzumura then lock 2 at 6 − 4 + 1 = 3 and never raise the lock when 1
    // leaves the stack, so 2 is refused at depth 3 on 0 → 6 → 7 and the cycle [0, 6, 7, 2, 1] is lost.
    const graph = Digraph.fromPairs(8, [
      [0, 1],
      [0, 6],
      [1, 0],
      [1, 2],
      [2, 1],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
      [6, 7],
      [7, 2],
    ]);
    expect(elementaryCycles(graph, { maxCycles: Number.POSITIVE_INFINITY, maxLength: 6 })).toEqual({
      cycles: [
        [0, 1],
        [0, 1, 2, 3, 4, 5],
        [0, 6, 7, 2, 1],
        [1, 2],
      ],
      truncated: false,
    });
  });

  it("matches brute force on larger graphs and multigraphs", () => {
    fc.assert(
      fc.property(
        fc.boolean().chain((merge) => graphArb(14, 34, merge)),
        fc.integer({ min: 1, max: 7 }),
        (graph, maxLength) => {
          expect(
            elementaryCycles(graph, { maxCycles: Number.POSITIVE_INFINITY, maxLength }),
          ).toEqual({ cycles: bruteForceCycles(graph, maxLength), truncated: false });
        },
      ),
      { numRuns: 400 },
    );
  });

  it("matches brute force on dense graphs", () => {
    fc.assert(
      fc.property(graphArb(10, 45), fc.integer({ min: 2, max: 5 }), (graph, maxLength) => {
        expect(elementaryCycles(graph, { maxCycles: Number.POSITIVE_INFINITY, maxLength })).toEqual(
          { cycles: bruteForceCycles(graph, maxLength), truncated: false },
        );
      }),
      { numRuns: 300 },
    );
  });

  it("returns a prefix of the enumeration when truncated", () => {
    fc.assert(
      fc.property(
        graphArb(12, 36),
        fc.integer({ min: 1, max: 5 }),
        fc.nat(40),
        (graph, maxLength, maxCycles) => {
          const all = bruteForceCycles(graph, maxLength);
          const result = elementaryCycles(graph, { maxCycles, maxLength });
          expect(result.cycles).toEqual(all.slice(0, maxCycles));
          expect(result.truncated).toBe(all.length > maxCycles);
        },
      ),
      { numRuns: 300 },
    );
  });
});
