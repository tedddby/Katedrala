/**
 * P0 of module inference: scopes and nodes (§3.4; docs/ALGORITHMS.md, "Modules", P0).
 *
 * Module inference runs per scope: the files of one package, or the files outside every package. Inferred
 * modules never span scopes, so cross-package structure stays the package view's job and a change in one
 * package cannot alter another package's modules (§3.4). The nodes are the files whose role is one of
 * `inference.modules.file_roles` (default `source`) and that no declared module owns (§3.14). One weighted
 * file graph (§1.3) is built over every node and then restricted per scope, so no later phase sees an edge
 * between scopes (D-03).
 *
 * Determinism: scopes are listed in identifier order (`""` first), nodes in file identifier order; the graph
 * is built from the model's memoized projection in CSR order.
 */
import { compareStrings } from "@katedrala/ir";
import type { EdgeKind, FileId } from "@katedrala/ir";
import { normalizeProjectionSpec } from "@katedrala/model";
import type { ArchitectureModel, ProjectionOptions } from "@katedrala/model";
import type {
  InferenceSettings,
  ModuleSettings,
  Scope,
  ScopeId,
  WeightedFileGraph,
} from "../types.js";
import { buildWeightedFileGraph, restrictWeightedGraph } from "../weighted-graph.js";

/**
 * Whether modules are inferred at all [DERIVED] (§3.14, plan 4.4 P0 step 4, D-21): not when
 * `inference.modules.enabled` is false, and not when `when_declared` is `none` and at least one module is
 * declared. With `none` and no declared module, every module is inferred. Declared modules are produced in
 * every case.
 *
 * Complexity: O(1). Determinism: a pure function of its arguments.
 */
export function shouldInferModules(settings: ModuleSettings, declaredModules: number): boolean {
  // D-21: `enabled: false` disables inferred modules even with declared ones; `none` needs a declaration.
  if (!settings.enabled) return false;
  return settings.whenDeclared !== "none" || declaredModules === 0;
}

/**
 * The edge kinds of the metrics projection, defaults applied [DERIVED]: the relationship kinds module
 * inference and attachment weigh (D-02, D-41), `DEFAULT_EDGE_KINDS` when the projection does not name any.
 * The set iterates in sorted order.
 *
 * Complexity: O(k log k) for k kinds. Determinism: sorted.
 */
export function metricsEdgeKinds(projection: ProjectionOptions): ReadonlySet<EdgeKind> {
  return normalizeProjectionSpec({ level: "file", ...projection }).edgeKinds;
}

/**
 * The files of the document's declared entry points [DERIVED] (D-31): the entity of every `EntryPointEntry`
 * of any kind when it is a file, or the file of its symbol. Used by the orchestrator rule of P3 and by the
 * `wiring-share` signal of P9. The set iterates in identifier order.
 *
 * Complexity: O(E log E) for E entry points. Determinism: sorted, independent of the document's order.
 */
export function entryPointFiles(model: ArchitectureModel): ReadonlySet<FileId> {
  const files: FileId[] = [];
  for (const entry of model.document.entryPoints ?? []) {
    const file = model.fileOf(entry.entity);
    if (file !== undefined) files.push(file);
  }
  return new Set([...new Set(files)].sort(compareStrings));
}

/** What {@link moduleScopes} reads [DERIVED] (P0, §3.4; D-02, D-03). */
export interface ModuleScopesInput {
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  /** The metrics projection: its edge kinds are the module graph's (D-02). */
  readonly projection: ProjectionOptions;
  /** The members of declared modules, which are not nodes (§3.14). */
  readonly declaredFiles: ReadonlySet<FileId>;
}

/** The scopes of module inference and the graph they are restricted from [DERIVED] (P0, §3.4). */
export interface ModuleScopes {
  /** The weighted file graph over every node of every scope (§1.3). */
  readonly graph: WeightedFileGraph;
  /** Scopes with at least one node, in identifier order (`""` first). */
  readonly scopes: readonly Scope[];
}

/**
 * P0, scopes and nodes (§3.4; plan 4.4 P0 steps 2–3) [DERIVED]: a partition of the weighted file graph,
 * itself a [KATEDRALA HEURISTIC] (§1.3):
 *
 * - the nodes are the files with a role in `settings.modules.fileRoles` that no declared module owns; the
 *   graph is `buildWeightedFileGraph(model, { ...weighting, edgeKinds, fileRoles, exclude: declaredFiles })`
 *   with the metrics projection's edge kinds (D-02), so edges to declared files are not evidence (§3.14);
 * - the nodes are partitioned by scope, `FileEntity.package ?? ""`, and the scopes are listed in identifier
 *   order (`""` first). Each scope gets its package path as `directory` (`""` without a package), the
 *   package's `name` as `packageName` (as the document writes it: an unnamed manifest's name is its path, or
 *   `.` at the root, D-12), and the graph restricted to its nodes with `restrictWeightedGraph` (D-03), whose
 *   node `i` is the scope's i-th node in file identifier order.
 *
 * Files whose analysis failed keep their role and are nodes without edges (§3.4). Whether to call this at
 * all is {@link shouldInferModules}'s decision (step 4).
 *
 * Complexity: O(n + m_IR) time for the graph (memoized projection), O(n + m) for the restrictions.
 * Determinism: scopes in `compareStrings` order of their ids; nodes ascending.
 */
export function moduleScopes(input: ModuleScopesInput): ModuleScopes {
  const { model, settings, projection, declaredFiles } = input;
  const graph = buildWeightedFileGraph(model, {
    ...settings.weighting,
    edgeKinds: metricsEdgeKinds(projection),
    fileRoles: settings.modules.fileRoles,
    exclude: declaredFiles,
  });
  const nodesOf = new Map<ScopeId, number[]>();
  graph.nodes.forEach((file, node) => {
    const scope: ScopeId = model.index.file(file)?.package ?? "";
    const nodes = nodesOf.get(scope);
    if (nodes === undefined) nodesOf.set(scope, [node]);
    else nodes.push(node);
  });
  const scopes = [...nodesOf.keys()].sort(compareStrings).map((id): Scope => {
    const restricted = restrictWeightedGraph(graph, Int32Array.from(nodesOf.get(id) ?? []));
    const pkg = id === "" ? undefined : model.index.package(id);
    return pkg === undefined
      ? { id, directory: "", graph: restricted }
      : { id, directory: pkg.path, packageName: pkg.name, graph: restricted };
  });
  return { graph, scopes };
}
