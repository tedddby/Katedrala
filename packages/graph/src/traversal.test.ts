import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { Digraph, GraphError } from "./digraph.js";
import { bfs, reachableFrom, shortestPath } from "./traversal.js";
import type { Direction } from "./traversal.js";

const graphArb = (maxNodes: number, maxEdges: number) =>
  fc.integer({ min: 0, max: maxNodes }).chain((n) =>
    fc
      .array(fc.tuple(fc.nat(Math.max(0, n - 1)), fc.nat(Math.max(0, n - 1))), {
        maxLength: n === 0 ? 0 : maxEdges,
      })
      .map((pairs) => Digraph.fromPairs(n, pairs)),
  );

const nonEmptyGraphArb = (maxNodes: number, maxEdges: number) =>
  graphArb(maxNodes, maxEdges).filter((g) => g.nodeCount > 0);

const directionArb = fc.constantFrom<Direction>("out", "in");

/** All-pairs edge distances by Floyd–Warshall; Infinity when unreachable. */
function distances(graph: Digraph, direction: Direction): number[][] {
  const n = graph.nodeCount;
  const d = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : Number.POSITIVE_INFINITY)),
  );
  for (const [u, v] of graph.edges()) {
    const [a, b] = direction === "out" ? [u, v] : [v, u];
    if (a !== b) d[a]![b] = 1;
  }
  for (let k = 0; k < n; k++)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) d[i]![j] = Math.min(d[i]![j]!, d[i]![k]! + d[k]![j]!);
  return d;
}

const hasArc = (graph: Digraph, from: number, to: number, direction: Direction) =>
  direction === "out" ? graph.hasEdge(from, to) : graph.hasEdge(to, from);

describe("bfs", () => {
  const diamond = Digraph.fromPairs(5, [
    [0, 2],
    [0, 1],
    [1, 3],
    [2, 3],
    [3, 4],
  ]);

  it("computes distances, order and a deterministic tree", () => {
    const result = bfs(diamond, [0]);
    expect([...result.order]).toEqual([0, 1, 2, 3, 4]);
    expect([...result.distance]).toEqual([0, 1, 1, 2, 3]);
    // Node 3 is reached through 1, the first of its parents in visiting order.
    expect([...result.parent]).toEqual([-1, 0, 0, 1, 3]);
  });

  it("follows edges backwards with direction 'in'", () => {
    const result = bfs(diamond, [4], { direction: "in" });
    expect([...result.order]).toEqual([4, 3, 1, 2, 0]);
    expect([...result.distance]).toEqual([3, 2, 2, 1, 0]);
    expect([...result.parent]).toEqual([1, 3, 3, 4, -1]);
  });

  it("de-duplicates and sorts sources", () => {
    const result = bfs(diamond, new Set([3, 1, 3]));
    expect([...result.order]).toEqual([1, 3, 4]);
    expect([...result.distance]).toEqual([-1, 0, -1, 0, 1]);
    expect([...result.parent]).toEqual([-1, -1, -1, -1, 3]);
  });

  it("honours maxDepth", () => {
    expect([...bfs(diamond, [0], { maxDepth: 1 }).order]).toEqual([0, 1, 2]);
    expect([...bfs(diamond, [0], { maxDepth: 0 }).order]).toEqual([0]);
    expect([...bfs(diamond, [0], { maxDepth: 2 }).distance]).toEqual([0, 1, 1, 2, -1]);
  });

  it("handles empty inputs, a single node and self-loops", () => {
    const empty = bfs(Digraph.fromPairs(0, []), []);
    expect(empty.order.length).toBe(0);
    const single = bfs(Digraph.fromPairs(1, []), [0]);
    expect([...single.order]).toEqual([0]);
    expect([...single.distance]).toEqual([0]);
    expect([...single.parent]).toEqual([-1]);
    const loop = bfs(Digraph.fromPairs(2, [[0, 0]]), [0]);
    expect([...loop.order]).toEqual([0]);
    expect([...loop.distance]).toEqual([0, -1]);
    expect(bfs(diamond, []).order.length).toBe(0);
  });

  it("rejects invalid arguments", () => {
    expect(() => bfs(diamond, [5])).toThrow(GraphError);
    expect(() => bfs(diamond, [-1])).toThrow(GraphError);
    expect(() => bfs(diamond, [0], { maxDepth: -1 })).toThrow(GraphError);
    expect(() => bfs(diamond, [0], { maxDepth: 1.5 })).toThrow(GraphError);
    expect(() => bfs(diamond, [0], { direction: "up" as Direction })).toThrow(GraphError);
  });

  it("agrees with Floyd–Warshall distances and yields a valid first-parent tree", () => {
    fc.assert(
      fc.property(
        nonEmptyGraphArb(10, 30),
        directionArb,
        fc.array(fc.nat(9), { maxLength: 3 }),
        (graph, direction, rawSources) => {
          const n = graph.nodeCount;
          const sources = rawSources.map((s) => s % n);
          const result = bfs(graph, sources, { direction });
          const d = distances(graph, direction);
          const position = new Map([...result.order].map((v, i) => [v, i]));
          for (let v = 0; v < n; v++) {
            const best = Math.min(Number.POSITIVE_INFINITY, ...sources.map((s) => d[s]![v]!));
            expect(result.distance[v]).toBe(best === Number.POSITIVE_INFINITY ? -1 : best);
            const p = result.parent[v]!;
            if (result.distance[v]! <= 0) {
              expect(p).toBe(-1);
              continue;
            }
            expect(hasArc(graph, p, v, direction)).toBe(true);
            expect(result.distance[p]).toBe(result.distance[v]! - 1);
            // The parent is the earliest visited candidate.
            for (const [u, i] of position) {
              if (i >= position.get(p)!) continue;
              if (result.distance[u] === result.distance[v]! - 1) {
                expect(hasArc(graph, u, v, direction)).toBe(false);
              }
            }
          }
          const order = [...result.order];
          expect(new Set(order).size).toBe(order.length);
          for (let i = 1; i < order.length; i++) {
            expect(result.distance[order[i]!]).toBeGreaterThanOrEqual(
              result.distance[order[i - 1]!]!,
            );
          }
          expect(order.slice(0, new Set(sources).size)).toEqual(
            [...new Set(sources)].sort((a, b) => a - b),
          );
        },
      ),
    );
  });

  it("with maxDepth equals the unbounded search cut at that depth", () => {
    fc.assert(
      fc.property(nonEmptyGraphArb(10, 30), fc.nat(4), (graph, maxDepth) => {
        const full = bfs(graph, [0]);
        const cut = bfs(graph, [0], { maxDepth });
        for (let v = 0; v < graph.nodeCount; v++) {
          const d = full.distance[v]!;
          expect(cut.distance[v]).toBe(d <= maxDepth ? d : -1);
        }
      }),
    );
  });
});

describe("reachableFrom", () => {
  it("includes the sources and follows the chosen direction", () => {
    const g = Digraph.fromPairs(5, [
      [0, 1],
      [1, 2],
      [3, 2],
    ]);
    expect([...reachableFrom(g, [0])]).toEqual([1, 1, 1, 0, 0]);
    expect([...reachableFrom(g, [2], "in")]).toEqual([1, 1, 1, 1, 0]);
    expect([...reachableFrom(g, [4, 4])]).toEqual([0, 0, 0, 0, 1]);
    expect([...reachableFrom(g, [])]).toEqual([0, 0, 0, 0, 0]);
    expect([...reachableFrom(Digraph.fromPairs(0, []), [])]).toEqual([]);
    expect([...reachableFrom(Digraph.fromPairs(1, [[0, 0]]), [0])]).toEqual([1]);
    expect(() => reachableFrom(g, [7])).toThrow(GraphError);
  });

  it("matches the transitive closure", () => {
    fc.assert(
      fc.property(nonEmptyGraphArb(10, 30), directionArb, fc.nat(9), (graph, direction, s) => {
        const source = s % graph.nodeCount;
        const d = distances(graph, direction);
        const mask = reachableFrom(graph, [source], direction);
        for (let v = 0; v < graph.nodeCount; v++) {
          expect(mask[v]).toBe(d[source]![v]! < Number.POSITIVE_INFINITY ? 1 : 0);
        }
      }),
    );
  });
});

describe("shortestPath", () => {
  const g = Digraph.fromPairs(6, [
    [0, 1],
    [1, 2],
    [2, 3],
    [0, 4],
    [4, 3],
    [5, 5],
  ]);

  it("returns a shortest node sequence", () => {
    expect(shortestPath(g, 0, 3)).toEqual([0, 4, 3]);
    expect(shortestPath(g, 3, 0, "in")).toEqual([3, 4, 0]);
    expect(shortestPath(g, 2, 2)).toEqual([2]);
    expect(shortestPath(g, 5, 5)).toEqual([5]);
    expect(shortestPath(Digraph.fromPairs(1, []), 0, 0)).toEqual([0]);
    expect(shortestPath(g, 3, 0)).toBeUndefined();
    expect(shortestPath(g, 0, 5)).toBeUndefined();
    expect(() => shortestPath(g, 0, 6)).toThrow(GraphError);
    expect(() => shortestPath(g, -1, 0)).toThrow(GraphError);
  });

  it("is a valid path of minimum length and agrees with the BFS tree", () => {
    fc.assert(
      fc.property(
        nonEmptyGraphArb(10, 30),
        directionArb,
        fc.nat(9),
        fc.nat(9),
        (graph, direction, a, b) => {
          const source = a % graph.nodeCount;
          const target = b % graph.nodeCount;
          const d = distances(graph, direction)[source]![target]!;
          const path = shortestPath(graph, source, target, direction);
          if (d === Number.POSITIVE_INFINITY) {
            expect(path).toBeUndefined();
            return;
          }
          expect(path).toBeDefined();
          expect(path!.length).toBe(d + 1);
          expect(path![0]).toBe(source);
          expect(path![path!.length - 1]).toBe(target);
          for (let i = 1; i < path!.length; i++) {
            expect(hasArc(graph, path![i - 1]!, path![i]!, direction)).toBe(true);
          }
          const tree = bfs(graph, [source], { direction });
          const fromTree = [target];
          for (let x = target; x !== source; x = tree.parent[x]!) fromTree.push(tree.parent[x]!);
          expect(path).toEqual(fromTree.reverse());
        },
      ),
    );
  });
});
