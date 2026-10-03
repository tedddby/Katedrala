# @katedrala/graph

Compact, immutable graphs and deterministic implementations of the standard graph algorithms Katedrala's
analyses are built on: traversal, strongly connected components, topological order, reachability and
propagation cost, cycles, feedback arc sets, betweenness centrality, PageRank, modularity and Louvain
clustering.

The package has no runtime dependencies and knows nothing about the Katedrala IR: nodes are the integers
`0 .. n − 1`. Graph projections (symbol, file, component, module level) are built by `@katedrala/model`.

## Design

- **Compact.** `Digraph` stores both adjacency directions in compressed sparse row form (`Int32Array`
  offsets and targets, `Float64Array` weights); `UndirectedGraph` does the same for undirected weighted
  graphs. Memory is proportional to nodes + edges.
- **Deterministic.** Identical input gives identical output, bit for bit. Adjacency rows are sorted, nodes are
  visited in ascending order and ties are broken by the smallest index. Nothing uses `Math.random` or the
  clock; the two approximations (reachability sketches, sampled betweenness) take an explicit seed.
- **Iterative.** Every traversal uses explicit stacks or queues, so paths of hundreds of thousands of nodes
  are safe (the test suite runs the algorithms on a 300 000-node path and cycle).
- **Honest about approximations.** Functions that may estimate report it (`exact: false`) and document the
  estimator and its error.

## Example

```ts
import {
  Digraph,
  elementaryCycles,
  greedyFeedbackArcSet,
  pageRank,
  propagationCost,
  reachabilityCounts,
  stronglyConnectedComponents,
} from "@katedrala/graph";

// 0 → 1 → 2 → 0 is a dependency cycle; 2 also depends on 3.
const graph = Digraph.fromPairs(4, [
  [0, 1],
  [1, 2],
  [2, 0],
  [2, 3],
]);

stronglyConnectedComponents(graph).components; // [[0, 1, 2], [3]]
reachabilityCounts(graph, "out"); // { counts: [3, 3, 3, 0], exact: true }
propagationCost(graph); // 0.8125 = (4 + 4 + 4 + 1) / 16
elementaryCycles(graph, { maxCycles: 100 }); // { cycles: [[0, 1, 2]], truncated: false }
greedyFeedbackArcSet(graph); // [[2, 0]]
pageRank(graph).values; // rank flows from users to what they use
```

## API

Directions: `"out"` follows edges from source to target (in a dependency graph: what a node depends on);
`"in"` follows them backwards (what depends on a node). Invalid arguments throw `GraphError`.

### Graphs (`digraph.ts`)

| Export                                                            | Description                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `Digraph.fromEdges(n, sources, targets, weights?, options?)`      | Build from parallel arrays; parallel edges merged (weights summed) |
| `Digraph.fromPairs(n, pairs, options?)`                           | Build from `[source, target]` or `[source, target, weight]` tuples |
| `successors`, `predecessors`, `hasEdge`, `weight`, `reverse()`, … | Sorted adjacency views and queries                                 |
| `inducedSubgraph(nodes)`, `toUndirected()`                        | Derived graphs                                                     |
| `UndirectedGraph.fromEdges(n, sources, targets, weights?)`        | Undirected weighted graph; `strength(v)` counts self-loops twice   |
| `GraphError`                                                      | Error thrown for invalid input                                     |

### Algorithms

| Module            | Export                                                                                                           | Result                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `traversal.ts`    | `bfs(graph, sources, { direction?, maxDepth? })`                                                                 | `{ order, distance, parent }` (multi-source, deterministic shortest-path tree) |
|                   | `reachableFrom(graph, sources, direction?)`                                                                      | `Uint8Array` mask, sources included                                            |
|                   | `shortestPath(graph, source, target, direction?)`                                                                | node sequence or `undefined`                                                   |
| `scc.ts`          | `stronglyConnectedComponents(graph)`                                                                             | `{ count, componentOf, components }`, ordered by smallest member               |
|                   | `isNontrivialComponent(graph, members)`                                                                          | more than one node, or a self-loop                                             |
|                   | `condensation(graph, scc)`                                                                                       | component DAG, weights summed, no self-loops                                   |
| `dag.ts`          | `topologicalOrder(dag)`                                                                                          | lexicographically smallest order; throws on cycles                             |
|                   | `longestPathLengths(dag, direction?)`                                                                            | edges on the longest path from each node                                       |
| `reachability.ts` | `reachabilityCounts(graph, direction, { maxExactNodes?, sketchSize?, seed? })`                                   | `{ counts, exact }`: other nodes reachable; estimated above `maxExactNodes`    |
|                   | `propagationCost(graph, options?)`                                                                               | density of the visibility matrix                                               |
| `cycles.ts`       | `shortestCycleThrough(graph, node)`                                                                              | shortest cycle starting at `node`, or `undefined`                              |
|                   | `elementaryCycles(graph, { maxCycles, maxLength? })`                                                             | `{ cycles, truncated }`, lexicographic order, each from its smallest node      |
| `feedback.ts`     | `greedyFeedbackArcSet(graph)`                                                                                    | sorted `[source, target]` arcs whose removal leaves a DAG                      |
| `centrality.ts`   | `betweennessCentrality(graph, { normalized?, sample? })`                                                         | `{ values, exact }` (directed, unweighted)                                     |
| `pagerank.ts`     | `pageRank(graph, { damping?, tolerance?, maxIterations?, weighted? })`                                           | `{ values, iterations, converged }`, values sum to 1                           |
| `clustering.ts`   | `modularity(graph, communities, resolution?)`                                                                    | modularity Q of a partition of an `UndirectedGraph`                            |
|                   | `louvain(graph, { resolution?, initialCommunities?, maxLevels?, maxPasses?, minModularityGain?, minPassGain? })` | `{ communities, count, modularity, levels }`, connected communities            |
| `random.ts`       | `createRandom(seed)`                                                                                             | seeded generator in `[0, 1)` (mulberry32)                                      |
|                   | `sampleWithoutReplacement(n, k, random)`                                                                         | `k` distinct sorted integers below `n`                                         |

Every export carries TSDoc with its complexity, determinism guarantees and literature reference.

## Algorithms and references

| Function                       | Method                                                                                  | Complexity                  |
| ------------------------------ | --------------------------------------------------------------------------------------- | --------------------------- |
| `bfs`, `shortestPath`          | Breadth-first search (Moore 1959)                                                       | O(n + m)                    |
| `stronglyConnectedComponents`  | Tarjan (1972), explicit stack                                                           | O(n + m)                    |
| `condensation`                 | Harary, Norman & Cartwright (1965)                                                      | O(n + m log m)              |
| `topologicalOrder`             | Kahn (1962) with a binary min-heap                                                      | O(m + n log n)              |
| `longestPathLengths`           | Dynamic programming over the topological order (Cormen et al. 2009)                     | O(m + n log n)              |
| `reachabilityCounts` (exact)   | Condensation + bitset closure in reverse topological order (Purdom 1970)                | O((c + m_c) · c / 32)       |
| `reachabilityCounts` (approx.) | Size estimation with exponential ranks (Cohen 1997); relative standard error 1/√(k − 2) | O(k (c + m_c))              |
| `propagationCost`              | MacCormack, Rusnak & Baldwin (2006)                                                     | as `reachabilityCounts`     |
| `elementaryCycles`             | Johnson (1975); length-bounded search of Gupta & Suzumura (2021)                        | O((n + m)(c + 1)) unbounded |
| `greedyFeedbackArcSet`         | Eades, Lin & Smyth (1993), applied per strongly connected component                     | O((n + m) log(n + m))       |
| `betweennessCentrality`        | Brandes (2001); pivot sampling of Brandes & Pich (2007)                                 | O(n m), sampled O(k m)      |
| `pageRank`                     | Power iteration (Page et al. 1999), oriented as ComponentRank (Inoue et al. 2005)       | O((n + m) · iterations)     |
| `modularity`                   | Newman & Girvan (2004) with resolution (Reichardt & Bornholdt 2006)                     | O(n + m)                    |
| `louvain`                      | Blondel et al. (2008) + connectivity refinement (Traag, Waltman & van Eck 2019)         | O(m log d) per pass         |

- Bentley, J. & Floyd, R. (1987). Programming pearls: a sample of brilliance. _Communications of the ACM_
  30(9), 754–757.
- Blondel, V. D., Guillaume, J.-L., Lambiotte, R. & Lefebvre, E. (2008). Fast unfolding of communities in
  large networks. _Journal of Statistical Mechanics: Theory and Experiment_, P10008.
- Brandes, U. (2001). A faster algorithm for betweenness centrality. _Journal of Mathematical Sociology_
  25(2), 163–177.
- Brandes, U. & Pich, C. (2007). Centrality estimation in large networks. _International Journal of
  Bifurcation and Chaos_ 17(7), 2303–2318.
- Cohen, E. (1997). Size-estimation framework with applications to transitive closure and reachability.
  _Journal of Computer and System Sciences_ 55(3), 441–453.
- Cormen, T. H., Leiserson, C. E., Rivest, R. L. & Stein, C. (2009). _Introduction to Algorithms_, 3rd ed.
  MIT Press.
- Eades, P., Lin, X. & Smyth, W. F. (1993). A fast and effective heuristic for the feedback arc set problem.
  _Information Processing Letters_ 47(6), 319–323.
- Freeman, L. C. (1977). A set of measures of centrality based on betweenness. _Sociometry_ 40(1), 35–41.
- Gupta, A. & Suzumura, T. (2021). Finding all bounded-length simple cycles in a directed graph.
  arXiv:2105.10094.
- Harary, F., Norman, R. Z. & Cartwright, D. (1965). _Structural Models: An Introduction to the Theory of
  Directed Graphs_. Wiley.
- Inoue, K., Yokomori, R., Fujiwara, H., Yamamoto, T., Matsushita, M. & Kusumoto, S. (2005). Ranking
  significance of software components based on use relations. _IEEE Transactions on Software Engineering_
  31(3), 213–225.
- Johnson, D. B. (1975). Finding all the elementary circuits of a directed graph. _SIAM Journal on
  Computing_ 4(1), 77–84.
- Kahn, A. B. (1962). Topological sorting of large networks. _Communications of the ACM_ 5(11), 558–562.
- MacCormack, A., Rusnak, J. & Baldwin, C. Y. (2006). Exploring the structure of complex software designs:
  an empirical study of open source and proprietary code. _Management Science_ 52(7), 1015–1030.
- Moore, E. F. (1959). The shortest path through a maze. _Proceedings of the International Symposium on the
  Theory of Switching_, 285–292.
- Newman, M. E. J. & Girvan, M. (2004). Finding and evaluating community structure in networks. _Physical
  Review E_ 69(2), 026113.
- Page, L., Brin, S., Motwani, R. & Winograd, T. (1999). The PageRank citation ranking: bringing order to
  the Web. Stanford InfoLab technical report 1999-66.
- Purdom, P. (1970). A transitive closure algorithm. _BIT Numerical Mathematics_ 10(1), 76–94.
- Reichardt, J. & Bornholdt, S. (2006). Statistical mechanics of community detection. _Physical Review E_
  74(1), 016110.
- Tarjan, R. E. (1972). Depth-first search and linear graph algorithms. _SIAM Journal on Computing_ 1(2),
  146–160.
- Traag, V. A., Waltman, L. & van Eck, N. J. (2019). From Louvain to Leiden: guaranteeing well-connected
  communities. _Scientific Reports_ 9, 5233.
- Mulberry32: Ettinger, T. (2017), public-domain 32-bit generator.

## Conventions worth knowing

- **Reachability counts exclude the node itself** but include the other members of its strongly connected
  component. `propagationCost` adds self-visibility back: Σ (reach(v) + 1) / n².
- **PageRank direction.** Rank flows along out-edges (user → used), so heavily depended-upon nodes rank high.
  Dangling nodes spread their rank uniformly; self-loops are ordinary out-edges.
- **Betweenness** is directed and unweighted, normalized by (n − 1)(n − 2) by default.
- **Modularity** counts a self-loop of weight w as 2w in both A_ii and the node strength, the convention of
  `UndirectedGraph.strength` and of graphology.
- **Louvain** visits nodes in ascending order, considers candidate communities in ascending id, moves only on
  a gain larger than `minModularityGain` and ends a phase after a pass that gains at most `minPassGain`
  (default 1e-7; the reference implementation of Blondel et al. uses 1e-6). Communities are split into
  connected components at the end and numbered by smallest member.

## Testing

Each module has a co-located `*.test.ts` with hand-checked cases (empty graph, single node, self-loops,
disconnected graphs) and property-based tests (fast-check) against brute-force references: transitive closure,
mutual reachability, exhaustive cycle enumeration, Floyd–Warshall distances, Freeman's betweenness
definition, the PageRank fixpoint equation and the dense modularity formula. `graphology-oracle.test.ts`
compares betweenness, PageRank, modularity, strongly connected components and BFS distances with graphology,
which is a test-only devDependency. `scale.test.ts` runs the traversal-like algorithms on a 300 000-node path
and cycle and on 100 000-node random graphs.

## Limitations

- Betweenness and BFS-based functions ignore edge weights (unweighted shortest paths).
- Exact reachability counting is quadratic in the number of components; above `maxExactNodes` (default
  20 000) counts are estimates with about 12.7 % relative standard error for the default sketch size.
- `greedyFeedbackArcSet` is a heuristic; minimum feedback arc set is NP-hard.
- `elementaryCycles` output can be exponential in the graph size; `maxCycles` is mandatory.
- Louvain is a heuristic local optimizer of modularity and inherits its resolution limit.
