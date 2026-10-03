/**
 * Oracle tests: results are compared with graphology, an established JavaScript graph library, used here as
 * a test oracle only (it is a devDependency and must never be imported from non-test code).
 *
 * Convention alignment, read from the oracle sources (node_modules/graphology-*):
 * - Betweenness (graphology-metrics/centrality/betweenness.js): Brandes with BFS when `getEdgeWeight: null`;
 *   for directed graphs `normalized` divides by (n − 1)(n − 2) when n > 2 and leaves values unscaled
 *   otherwise. For n ≤ 2 all values are 0 anyway, so this matches our "values are 0" rule.
 * - PageRank (graphology-metrics/centrality/pagerank.js): the same power iteration (uniform start, dangling
 *   rank spread uniformly, self-loops are out-edges, weights normalized by total out-weight). Differences:
 *   graphology stops when the L1 change is below n·tolerance (ours: below tolerance), defaults to 100
 *   iterations and 1e-6, throws when it does not converge, and yields NaN for a node whose out-edges all
 *   weigh 0 (we treat such a node as dangling). The tests use tight tolerances and positive weights.
 * - Modularity (graphology-metrics/graph/modularity.js, sparse undirected version): Q = Σ_c [in_c/2m −
 *   γ(tot_c/2m)²] with a self-loop of weight w adding 2w to in_c and to tot_c and w to m — the same
 *   convention as ours. Difference: graphology throws on graphs without edges; we return 0.
 * - Strongly connected components (graphology-components): recursive Tarjan returning components in
 *   completion order with arbitrary member order; we compare them as sets.
 * - Unweighted single-source shortest path lengths (graphology-shortest-path): BFS depths of reachable nodes.
 */
import { createRequire } from "node:module";
import fc from "fast-check";
import { DirectedGraph, UndirectedGraph as GraphologyUndirectedGraph } from "graphology";
import type { DetailedLouvainOutput, LouvainOptions } from "graphology-communities-louvain";
import { stronglyConnectedComponents as oracleScc } from "graphology-components";
import { centrality, graph as graphMetrics } from "graphology-metrics";
import { unweighted } from "graphology-shortest-path";
import { describe, expect, it } from "vitest";
import { betweennessCentrality } from "./centrality.js";
import { louvain, modularity } from "./clustering.js";
import { Digraph, UndirectedGraph } from "./digraph.js";
import { pageRank } from "./pagerank.js";
import { createRandom } from "./random.js";
import { stronglyConnectedComponents } from "./scc.js";
import { bfs } from "./traversal.js";

interface LouvainOracle {
  detailed(graph: GraphologyUndirectedGraph, options?: LouvainOptions): DetailedLouvainOutput;
}

// graphology-communities-louvain is CommonJS (`module.exports = louvain`) with `export default` typings,
// which TypeScript's NodeNext resolution reads as `{ default: louvain }`. Load `module.exports` directly
// instead.
const louvainOracle = createRequire(import.meta.url)(
  "graphology-communities-louvain",
) as LouvainOracle;

const digraphArb = (maxNodes: number, maxEdges: number) =>
  fc.integer({ min: 1, max: maxNodes }).chain((n) =>
    fc
      .array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1), fc.integer({ min: 1, max: 9 })), {
        maxLength: maxEdges,
      })
      .map((triples) => Digraph.fromPairs(n, triples)),
  );

const undirectedArb = (maxNodes: number, maxEdges: number) =>
  fc.integer({ min: 1, max: maxNodes }).chain((n) =>
    fc.tuple(
      fc
        .array(fc.tuple(fc.nat(n - 1), fc.nat(n - 1), fc.integer({ min: 1, max: 9 })), {
          minLength: 1,
          maxLength: maxEdges,
        })
        .map((triples) =>
          UndirectedGraph.fromEdges(
            n,
            triples.map((t) => t[0]),
            triples.map((t) => t[1]),
            triples.map((t) => t[2]),
          ),
        ),
      fc.array(fc.integer({ min: 0, max: 3 }), { minLength: n, maxLength: n }),
    ),
  );

/** The same graph as a graphology DirectedGraph with nodes "0".."n−1" and a `weight` attribute. */
function toGraphology(graph: Digraph): DirectedGraph {
  const g = new DirectedGraph();
  for (let v = 0; v < graph.nodeCount; v++) g.addNode(String(v));
  for (const [u, v, w] of graph.edges()) g.addEdge(String(u), String(v), { weight: w });
  return g;
}

function toGraphologyUndirected(graph: UndirectedGraph): GraphologyUndirectedGraph {
  const g = new GraphologyUndirectedGraph();
  for (let v = 0; v < graph.nodeCount; v++) g.addNode(String(v));
  for (let u = 0; u < graph.nodeCount; u++) {
    for (let e = graph.offsets[u]!; e < graph.offsets[u + 1]!; e++) {
      const v = graph.neighbors[e]!;
      if (v >= u) g.addEdge(String(u), String(v), { weight: graph.weights[e]! });
    }
  }
  return g;
}

const byNode = (mapping: Record<string, number>, n: number) =>
  Array.from({ length: n }, (_, v) => mapping[String(v)]!);

describe("graphology oracle", () => {
  it("betweenness centrality agrees", () => {
    fc.assert(
      fc.property(digraphArb(30, 90), fc.boolean(), (graph, normalized) => {
        const expected = byNode(
          centrality.betweenness(toGraphology(graph), { getEdgeWeight: null, normalized }),
          graph.nodeCount,
        );
        const actual = betweennessCentrality(graph, { normalized }).values;
        expected.forEach((value, v) => {
          expect(actual[v]).toBeCloseTo(value, 9);
        });
      }),
      { numRuns: 150 },
    );
  });

  it("PageRank agrees (unweighted and weighted)", () => {
    fc.assert(
      fc.property(
        digraphArb(30, 90),
        fc.boolean(),
        fc.double({ min: 0.5, max: 0.9, noNaN: true }),
        (graph, weighted, damping) => {
          const expected = byNode(
            centrality.pagerank(toGraphology(graph), {
              getEdgeWeight: weighted ? "weight" : null,
              alpha: damping,
              tolerance: 1e-14,
              maxIterations: 100_000,
            }),
            graph.nodeCount,
          );
          const actual = pageRank(graph, { damping, weighted, tolerance: 1e-13 });
          expect(actual.converged).toBe(true);
          expected.forEach((value, v) => {
            expect(actual.values[v]).toBeCloseTo(value, 10);
          });
        },
      ),
      { numRuns: 150 },
    );
  });

  it("modularity of a given partition agrees", () => {
    fc.assert(
      fc.property(
        undirectedArb(25, 60),
        fc.double({ min: 0, max: 3, noNaN: true }),
        ([graph, communities], resolution) => {
          const expected = graphMetrics.modularity(toGraphologyUndirected(graph), {
            getNodeCommunity: (node: string) => communities[Number(node)]!,
            getEdgeWeight: "weight",
            resolution,
          });
          expect(modularity(graph, communities, resolution)).toBeCloseTo(expected, 12);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("modularity differs only on edgeless graphs, where graphology throws", () => {
    const empty = UndirectedGraph.fromEdges(2, [], []);
    expect(modularity(empty, [0, 1])).toBe(0);
    expect(() =>
      graphMetrics.modularity(toGraphologyUndirected(empty), { getNodeCommunity: () => 0 }),
    ).toThrow();
  });

  it("strongly connected components agree", () => {
    fc.assert(
      fc.property(digraphArb(40, 80), (graph) => {
        const expected = oracleScc(toGraphology(graph))
          .map((members) => members.map(Number).sort((a, b) => a - b))
          .sort((a, b) => a[0]! - b[0]!);
        const actual = stronglyConnectedComponents(graph).components.map((members) => [...members]);
        expect(actual).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it("breadth-first distances agree with unweighted single-source lengths", () => {
    fc.assert(
      fc.property(digraphArb(30, 80), fc.nat(29), (graph, raw) => {
        const source = raw % graph.nodeCount;
        const lengths = unweighted.singleSourceLength(toGraphology(graph), String(source));
        const { distance } = bfs(graph, [source]);
        for (let v = 0; v < graph.nodeCount; v++) {
          expect(distance[v]).toBe(lengths[String(v)] ?? -1);
        }
      }),
    );
  });

  it("Louvain finds the same planted partition and modularity as graphology's Louvain", () => {
    const sources: number[] = [];
    const targets: number[] = [];
    for (let c = 0; c < 4; c++) {
      for (let i = 0; i < 8; i++) {
        for (let j = i + 1; j < 8; j++) {
          sources.push(c * 8 + i);
          targets.push(c * 8 + j);
        }
      }
      sources.push(c * 8 + 7);
      targets.push(((c + 1) % 4) * 8);
    }
    const graph = UndirectedGraph.fromEdges(32, sources, targets);
    const oracle = louvainOracle.detailed(toGraphologyUndirected(graph), { rng: createRandom(1) });
    const oraclePartition = byNode(oracle.communities, 32);
    const ours = louvain(graph);
    expect(ours.count).toBe(oracle.count);
    expect(ours.modularity).toBeCloseTo(oracle.modularity, 12);
    expect(modularity(graph, oraclePartition)).toBeCloseTo(oracle.modularity, 12);
  });
});
