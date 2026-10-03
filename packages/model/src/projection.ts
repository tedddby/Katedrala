/**
 * Graph projections: the IR's typed relationship multigraph lifted to one level of granularity and stored
 * as a compact {@link Digraph} for the algorithms of `@katedrala/graph`.
 */
import { Digraph } from "@katedrala/graph";
import { compareStrings } from "@katedrala/ir";
import type { EdgeEntity, EdgeId, EdgeKind, EdgeKindCounts, EntityId } from "@katedrala/ir";
import { isExternalId, isFileId, isPackageId, isSymbolId } from "./identifiers.js";
import type { ArchitectureModel } from "./model.js";
import { normalizeProjectionSpec } from "./spec.js";
import type { NormalizedProjectionSpec, ProjectionSpec } from "./spec.js";

/** What a projection edge (or a unit's internal relationships) consists of. */
export interface ProjectionEdgeInfo {
  /** Distinct underlying IR edges. */
  edgeCount: number;
  /** Sum of the underlying edges' observations; the weight of the graph edge. */
  observations: number;
  /** Underlying edges that are not type-only (0 means the dependency vanishes at runtime). */
  runtimeEdgeCount: number;
  /** Underlying edge count per relationship kind, keys sorted. */
  kindCounts: EdgeKindCounts;
  /** Identifiers of the underlying edges, sorted. */
  edges: EdgeId[];
}

/**
 * Describe the edges `[start, end)` of `edges` (a range sorted by identifier, so that sums are computed in
 * an order independent of the document).
 */
function summarize(edges: readonly EdgeEntity[], start: number, end: number): ProjectionEdgeInfo {
  const ids: EdgeId[] = [];
  const kinds = new Map<EdgeKind, number>();
  let observations = 0;
  let runtimeEdgeCount = 0;
  for (const edge of edges.slice(start, end)) {
    ids.push(edge.id);
    observations += edge.observations;
    if (!edge.typeOnly) runtimeEdgeCount += 1;
    kinds.set(edge.kind, (kinds.get(edge.kind) ?? 0) + 1);
  }
  const kindCounts: EdgeKindCounts = {};
  for (const [kind, count] of [...kinds].sort(([a], [b]) => compareStrings(a, b))) {
    kindCounts[kind] = count;
  }
  return { edgeCount: ids.length, observations, runtimeEdgeCount, kindCounts, edges: ids };
}

/** An admitted IR edge with the node numbers of its lifted endpoints. */
interface LiftedEdge {
  readonly source: number;
  readonly target: number;
  readonly edge: EdgeEntity;
}

/** The unit of an edge endpoint, or undefined when the endpoint is not admitted or has no unit. */
function liftEndpoint(
  model: ArchitectureModel,
  spec: NormalizedProjectionSpec,
  node: EntityId,
): EntityId | undefined {
  if (isExternalId(node)) return spec.includeExternals ? node : undefined;
  if (isPackageId(node)) return spec.level === "package" ? node : undefined;
  if (!isFileId(node) && !isSymbolId(node)) return undefined;
  const file = model.fileOf(node);
  const fileEntity = file === undefined ? undefined : model.index.file(file);
  if (fileEntity === undefined || !spec.fileRoles.has(fileEntity.role)) return undefined;
  if (!spec.fileRoles.has(model.roleOf(node) ?? fileEntity.role)) return undefined;
  return model.unitOf(node, spec.level);
}

/** {@link liftEndpoint}, memoized per endpoint for one projection. */
function createLifter(
  model: ArchitectureModel,
  spec: NormalizedProjectionSpec,
): (node: EntityId) => EntityId | undefined {
  const cache = new Map<EntityId, EntityId | null>();
  return (node) => {
    const cached = cache.get(node);
    if (cached !== undefined) return cached ?? undefined;
    const unit = liftEndpoint(model, spec, node);
    cache.set(node, unit ?? null);
    return unit;
  };
}

/**
 * The relationships of a document lifted to one level: a directed graph whose nodes are units of the level
 * and whose edges are the merged dependencies between them.
 *
 * **Lifting rules** (normative). Every IR edge is considered on its own:
 *
 * 1. *Kind and type-only filter.* The edge is lifted only when its `kind` is in `spec.edgeKinds` and, when
 *    `spec.includeTypeOnly` is false, it is not `typeOnly`.
 * 2. *Admission.* Each endpoint must be admitted, otherwise the edge is dropped:
 *    - a file or symbol, when its file is listed in the document with a role in `spec.fileRoles` and, for a
 *      symbol, its effective role ({@link ArchitectureModel.roleOf}: a role declared by the symbol or its
 *      nearest lexical ancestor, e.g. an in-file test module) is in `spec.fileRoles` as well;
 *    - an external, only when `spec.includeExternals` is true;
 *    - a package, only at the `package` level (manifest relationships such as `depends-on-package`).
 * 3. *Mapping to units* ({@link ArchitectureModel.unitOf}):
 *    - `symbol`: symbols stay symbols and file endpoints (file-scope code, file-level imports) stay files, so
 *      a symbol projection has symbol and file nodes;
 *    - `file`: a symbol maps to its file;
 *    - `component`: the deepest component listing the file in its `files`;
 *    - `module` / `layer`: the module / layer listing the file;
 *    - `package`: the file's `package`; package endpoints map to themselves;
 *    - externals map to themselves at every level.
 *
 *    An endpoint without a unit at the level (e.g. a file in no module) drops the edge.
 * 4. *Internal relationships.* An edge whose endpoints map to the same unit is internal: it is not part of
 *    the graph (projections have no self-loops) and is summarized by {@link Projection.internalInfo}.
 * 5. *Merging.* Lifted edges between the same two units merge into one graph edge whose weight is the sum
 *    of the underlying edges' observations; {@link Projection.edgeInfo} describes it.
 *
 * **Nodes** are the units of every admitted file (at the `symbol` level also of every admitted listed
 * symbol), plus the units of the endpoints of every lifted edge: externals, packages without admitted files
 * (at the `package` level) and unlisted symbols become nodes only through relationships. A unit with
 * neither admitted members nor relationships (e.g. a component owning only test files when tests are not
 * admitted) is not a node.
 *
 * **Determinism.** Nodes are sorted by identifier (UTF-16 code units) and node `i` of {@link graph} is
 * `nodes[i]`; the graph is built from edges sorted by (source, target); every list is sorted. Nothing
 * depends on the order of the document's arrays.
 */
export class Projection {
  /** The specification of this projection, with defaults applied. */
  readonly spec: NormalizedProjectionSpec;
  /** Node identifiers, sorted; the index of an identifier is its node number in {@link graph}. */
  readonly nodes: readonly EntityId[];
  /**
   * The projected dependency graph (no self-loops, parallel edges merged). The weight of an edge is the sum
   * of the observations of its underlying IR edges.
   */
  readonly graph: Digraph;

  readonly #indexById: ReadonlyMap<EntityId, number>;
  /**
   * Underlying IR edges of the graph edges, in (source, target, id) order: out-edge `i` of {@link graph}
   * consists of `#edges[#edgeOffsets[i] .. #edgeOffsets[i + 1])` (compressed sparse row, like the graph).
   */
  readonly #edges: readonly EdgeEntity[];
  readonly #edgeOffsets: Int32Array;
  /** Internal relationships in (node, id) order, and each node's `[start, end)` range of them. */
  readonly #internalEdges: readonly EdgeEntity[];
  readonly #internalRanges: ReadonlyMap<number, readonly [number, number]>;

  /**
   * Compute the projection of a model's document. Prefer {@link ArchitectureModel.projection}, which
   * memoizes projections per specification.
   *
   * @throws {ModelError} `invalid-level` for an unknown level.
   * @throws {GraphError} (from `@katedrala/graph`) when an edge's observations are not a finite number.
   */
  constructor(model: ArchitectureModel, spec: ProjectionSpec) {
    const normalized = normalizeProjectionSpec(spec);
    const lift = createLifter(model, normalized);
    const nodeSet = new Set<EntityId>();
    const admit = (node: EntityId): void => {
      const unit = lift(node);
      if (unit !== undefined) nodeSet.add(unit);
    };
    for (const file of model.document.files) admit(file.id);
    if (normalized.level === "symbol") {
      for (const symbol of model.document.symbols) admit(symbol.id);
    }

    const admitted: Array<{ source: EntityId; target: EntityId; edge: EdgeEntity }> = [];
    for (const edge of model.document.edges) {
      if (!normalized.edgeKinds.has(edge.kind)) continue;
      if (edge.typeOnly && !normalized.includeTypeOnly) continue;
      const source = lift(edge.source);
      if (source === undefined) continue;
      const target = lift(edge.target);
      if (target === undefined) continue;
      nodeSet.add(source);
      nodeSet.add(target);
      admitted.push({ source, target, edge });
    }

    const nodes = [...nodeSet].sort(compareStrings);
    const indexById = new Map(nodes.map((id, index) => [id, index] as const));
    // Every lifted endpoint is a node; -1 could only come from a broken invariant (Digraph rejects it).
    const indexOf = (id: EntityId): number => indexById.get(id) ?? -1;
    const lifted: LiftedEdge[] = admitted.map(({ source, target, edge }) => ({
      source: indexOf(source),
      target: indexOf(target),
      edge,
    }));
    lifted.sort(
      (a, b) => a.source - b.source || a.target - b.target || compareStrings(a.edge.id, b.edge.id),
    );

    // Group equal (source, target) pairs: a pair is a graph edge, or internal when source === target.
    const sources: number[] = [];
    const targets: number[] = [];
    const weights: number[] = [];
    const offsets: number[] = [];
    const edges: EdgeEntity[] = [];
    const internalEdges: EdgeEntity[] = [];
    const internalRanges = new Map<number, readonly [number, number]>();
    let previous: LiftedEdge | undefined;
    let weight = 0;
    for (const entry of lifted) {
      if (entry.source === entry.target) {
        const start = internalRanges.get(entry.source)?.[0] ?? internalEdges.length;
        internalEdges.push(entry.edge);
        internalRanges.set(entry.source, [start, internalEdges.length]);
        continue;
      }
      if (previous?.source !== entry.source || previous.target !== entry.target) {
        if (previous !== undefined) weights.push(weight);
        weight = 0;
        sources.push(entry.source);
        targets.push(entry.target);
        offsets.push(edges.length);
        previous = entry;
      }
      edges.push(entry.edge);
      // Summed in identifier order, so the weight does not depend on the document's edge order.
      weight += entry.edge.observations;
    }
    if (previous !== undefined) weights.push(weight);
    offsets.push(edges.length);

    this.spec = normalized;
    this.nodes = Object.freeze(nodes);
    // The pairs are distinct and sorted by (source, target), so pair i is out-edge i of the graph.
    this.graph = Digraph.fromEdges(
      nodes.length,
      Int32Array.from(sources),
      Int32Array.from(targets),
      Float64Array.from(weights),
    );
    this.#indexById = indexById;
    this.#edges = edges;
    this.#edgeOffsets = Int32Array.from(offsets);
    this.#internalEdges = internalEdges;
    this.#internalRanges = internalRanges;
  }

  /** The node number of an entity, or -1 when it is not a node of this projection. */
  indexOf(id: EntityId): number {
    return this.#indexById.get(id) ?? -1;
  }

  /**
   * What the edge `source → target` (node numbers) consists of; undefined when there is no such edge.
   * Returns a new object on every call.
   */
  edgeInfo(source: number, target: number): ProjectionEdgeInfo | undefined {
    if (!this.#isNode(source) || !this.#isNode(target)) return undefined;
    return this.edgeInfoAt(this.graph.edgeIndex(source, target));
  }

  /**
   * What the graph's out-edge with index `edgeIndex` consists of (the edge `u → graph.outTargets[edgeIndex]`
   * with `graph.outOffsets[u] <= edgeIndex < graph.outOffsets[u + 1]`); undefined for an invalid index.
   * Returns a new object on every call.
   */
  edgeInfoAt(edgeIndex: number): ProjectionEdgeInfo | undefined {
    if (!Number.isInteger(edgeIndex)) return undefined;
    const start = this.#edgeOffsets[edgeIndex];
    const end = this.#edgeOffsets[edgeIndex + 1];
    return start === undefined || end === undefined
      ? undefined
      : summarize(this.#edges, start, end);
  }

  /**
   * The lifted relationships whose endpoints both map to `node` (dropped from the graph as internal, e.g.
   * dependencies between files of the same module); undefined when there are none. Returns a new object
   * on every call.
   */
  internalInfo(node: number): ProjectionEdgeInfo | undefined {
    const range = this.#internalRanges.get(node);
    return range === undefined ? undefined : summarize(this.#internalEdges, range[0], range[1]);
  }

  /** The nodes `id` depends on directly, sorted; empty when `id` is not a node. */
  dependencies(id: EntityId): EntityId[] {
    const node = this.indexOf(id);
    return node === -1 ? [] : this.#idsOf(this.graph.successors(node));
  }

  /** The nodes that depend on `id` directly, sorted; empty when `id` is not a node. */
  dependents(id: EntityId): EntityId[] {
    const node = this.indexOf(id);
    return node === -1 ? [] : this.#idsOf(this.graph.predecessors(node));
  }

  #isNode(node: number): boolean {
    return Number.isInteger(node) && node >= 0 && node < this.nodes.length;
  }

  /** Identifiers of ascending node numbers (hence sorted). */
  #idsOf(indices: Int32Array): EntityId[] {
    const ids: EntityId[] = [];
    for (const index of indices) {
      const id = this.nodes[index];
      if (id !== undefined) ids.push(id);
    }
    return ids;
  }
}
