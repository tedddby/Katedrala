/**
 * The weighted file graph of §1.3 (docs/ALGORITHMS.md, "Shared definitions"): the evidence module inference,
 * attachment and layer ordering read. One node per admitted file; one arc per ordered file pair with an
 * admitted dependency, weighted 1 when some admitted relationship is used at runtime and `typeOnlyWeight`
 * when all are type-only. How many relationships or observations connect two files is deliberately ignored:
 * membership is a question of which files work together (§1.3), which is also how the fixtures define
 * "mostly" (a strict majority of distinct dependent files).
 *
 * Exact arithmetic (D-67): the weights are 1 and `typeOnlyWeight`, a multiple of 1/1024, so every sum of
 * fewer than 2^43 weights is exact in float64. Sums of equal value compare equal whatever the summation
 * order, which keeps every majority, tie and threshold of the algorithm exact.
 *
 * Determinism: nodes are sorted by identifier and the arcs are built in CSR order of the model's memoized
 * projection, so nothing depends on the order of the document's arrays.
 */
import { Digraph } from "@katedrala/graph";
import type { EdgeEntity, EntityId, FileId } from "@katedrala/ir";
import type { ArchitectureModel } from "@katedrala/model";
import type { WeightedFileGraph, WeightedGraphOptions } from "./types.js";

/** The bits a pair of files collects from its underlying relationships. */
const ADMITTED = 1;
const RUNTIME = 2;
const REEXPORT = 4;

/** Whether a node of a file-level projection is a file (projections without externals have only files). */
function isFileNode(id: EntityId): id is FileId {
  return id.startsWith("file:");
}

/** A {@link WeightedFileGraph} whose file → node lookup is built on first use. */
class FileGraph implements WeightedFileGraph {
  readonly nodes: readonly FileId[];
  readonly graph: Digraph;
  readonly admittedOutDegree: Int32Array;
  readonly reexportOutDegree: Int32Array;
  #index: ReadonlyMap<FileId, number> | undefined;

  constructor(
    nodes: readonly FileId[],
    graph: Digraph,
    admittedOutDegree: Int32Array,
    reexportOutDegree: Int32Array,
  ) {
    this.nodes = Object.freeze(nodes);
    this.graph = graph;
    this.admittedOutDegree = admittedOutDegree;
    this.reexportOutDegree = reexportOutDegree;
  }

  indexOf(file: FileId): number {
    this.#index ??= new Map(this.nodes.map((id, index) => [id, index] as const));
    return this.#index.get(file) ?? -1;
  }
}

/**
 * Build the weighted file graph of §1.3 [KATEDRALA HEURISTIC] from the model's file projection
 * `{ level: "file", edgeKinds, includeTypeOnly: true, fileRoles }` (memoized by the model, so an identical
 * specification is shared with later callers):
 *
 * - the nodes are the projection's nodes minus `exclude` (declared-module files during module inference),
 *   sorted by identifier;
 * - for every projection edge `u → v` between kept nodes, the underlying relationships are visited without
 *   allocating; a relationship is *admitted* when its confidence is at least `minEdgeConfidence`;
 * - D-01: only admitted relationships decide runtime against type-only, so a 0.3-confidence runtime edge next
 *   to a 0.9 type-only edge gives `typeOnlyWeight`, and a pair without admitted relationships gives 0;
 * - the weight is 1 when an admitted relationship is not type-only, else `typeOnlyWeight`; a pair becomes an
 *   arc only when its weight is greater than 0;
 * - D-04: `admittedOutDegree[u]` counts the targets `u` reaches through admitted relationships, arcs of
 *   weight 0 included (with `type_only_weight = 0` a type-only barrel is still a facade), and
 *   `reexportOutDegree[u]` those among them reached through an admitted `re-exports` relationship.
 *
 * D-02: type-only relationships are always lifted, whatever `analysis.include_type_only` says, because
 * inference weighs them with `typeOnlyWeight` (0 disables them); layer ordering uses the same graph (D-51).
 * D-03: callers restrict the graph per scope with {@link restrictWeightedGraph}, so no later phase sees an
 * arc between packages.
 *
 * Complexity: O(n + m_IR) time for n nodes and m_IR underlying relationships (after the memoized projection),
 * O(n + m) memory for m arcs. Determinism: arcs are visited in CSR order of the projection (sources and
 * targets ascending); the result does not depend on the order of the document's arrays.
 *
 * @throws {RangeError} when `typeOnlyWeight` is not a multiple of 1/1024 in [0, 1] (D-67: the engine's
 *   validator accepts no other value) or `minEdgeConfidence` is not a finite number.
 */
export function buildWeightedFileGraph(
  model: ArchitectureModel,
  options: WeightedGraphOptions,
): WeightedFileGraph {
  const { typeOnlyWeight, minEdgeConfidence, edgeKinds, fileRoles, exclude } = options;
  // D-67: dyadic weights keep every sum, majority and tie exact; anything else would make ties depend on
  // the summation order.
  if (!(typeOnlyWeight >= 0 && typeOnlyWeight <= 1 && Number.isInteger(typeOnlyWeight * 1024))) {
    throw new RangeError(
      `typeOnlyWeight must be a multiple of 1/1024 in [0, 1] (D-67), got ${typeOnlyWeight}`,
    );
  }
  if (!Number.isFinite(minEdgeConfidence)) {
    throw new RangeError(`minEdgeConfidence must be a finite number, got ${minEdgeConfidence}`);
  }
  // D-02: type-only relationships always take part; `typeOnlyWeight` decides what they weigh.
  const projection = model.projection({
    level: "file",
    edgeKinds,
    includeTypeOnly: true,
    fileRoles,
  });
  const { graph } = projection;
  // Projection node → node of this graph, or -1 when the file is excluded. The kept nodes stay sorted.
  const local = new Int32Array(graph.nodeCount);
  const nodes: FileId[] = [];
  projection.nodes.forEach((id, index) => {
    if (!isFileNode(id) || exclude?.has(id) === true) {
      local[index] = -1;
    } else {
      local[index] = nodes.length;
      nodes.push(id);
    }
  });

  const admittedOutDegree = new Int32Array(nodes.length);
  const reexportOutDegree = new Int32Array(nodes.length);
  const sources: number[] = [];
  const targets: number[] = [];
  const weights: number[] = [];
  let pair = 0;
  const visit = (edge: EdgeEntity): void => {
    // D-01: an edge below the confidence threshold is no evidence, not even of a type-only dependency.
    if (edge.confidence < minEdgeConfidence) return;
    pair |= ADMITTED;
    if (!edge.typeOnly) pair |= RUNTIME;
    if (edge.kind === "re-exports") pair |= REEXPORT;
  };
  for (let u = 0; u < graph.nodeCount; u++) {
    const source = local[u]!;
    if (source === -1) continue;
    for (let e = graph.outOffsets[u]!; e < graph.outOffsets[u + 1]!; e++) {
      const target = local[graph.outTargets[e]!]!;
      if (target === -1) continue;
      pair = 0;
      projection.forEachUnderlyingEdge(e, visit);
      if ((pair & ADMITTED) === 0) continue;
      // D-04: admitted pairs count for the facade test even when their weight is 0.
      admittedOutDegree[source]!++;
      if ((pair & REEXPORT) !== 0) reexportOutDegree[source]!++;
      const weight = (pair & RUNTIME) !== 0 ? 1 : typeOnlyWeight;
      if (weight > 0) {
        sources.push(source);
        targets.push(target);
        weights.push(weight);
      }
    }
  }
  // The pairs are distinct and sorted by (source, target), so out-edge i of the graph is pair i.
  return new FileGraph(
    nodes,
    Digraph.fromEdges(nodes.length, sources, targets, weights),
    admittedOutDegree,
    reexportOutDegree,
  );
}

/**
 * The weighted file graph induced by a subset of its nodes [KATEDRALA HEURISTIC] (D-03: P0 restricts the
 * module graph to each scope): node `i` of the result is the i-th smallest selected node, every arc between
 * selected nodes keeps its weight, and arcs to other nodes are dropped. Built with `Digraph.inducedSubgraph`,
 * whose `mapping` gives the selected nodes.
 *
 * The degree arrays are carried along: `admittedOutDegree` and `reexportOutDegree` of a selected node are
 * those of the input graph. They still count targets outside the selection, because pairs of weight 0 are
 * not arcs of `graph` and could not be recounted (D-04); the facade test of P3 therefore reads the same
 * degrees in every scope.
 *
 * Complexity: O(n_S + m_S + out-degree sum of the selection). Determinism: `nodes` may be given in any order;
 * duplicates are ignored.
 *
 * @throws {GraphError} (from `@katedrala/graph`) when an entry of `nodes` is not a node of `graph`.
 */
export function restrictWeightedGraph(
  graph: WeightedFileGraph,
  nodes: Int32Array,
): WeightedFileGraph {
  const { graph: induced, mapping } = graph.graph.inducedSubgraph(nodes);
  const files: FileId[] = [];
  const admittedOutDegree = new Int32Array(mapping.length);
  const reexportOutDegree = new Int32Array(mapping.length);
  for (let index = 0; index < mapping.length; index++) {
    const node = mapping[index]!;
    files.push(graph.nodes[node]!);
    admittedOutDegree[index] = graph.admittedOutDegree[node]!;
    reexportOutDegree[index] = graph.reexportOutDegree[node]!;
  }
  return new FileGraph(files, induced, admittedOutDegree, reexportOutDegree);
}
