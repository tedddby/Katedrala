/**
 * P8 of module inference: entry points, public API and packages of every module (§3.12; plan 4.4 P8;
 * docs/ALGORITHMS.md, "Modules", P8) [DERIVED from memberships and observed relationships].
 *
 * - **Entry points** are the module's intended surface: for inferred modules, members named `index.*`
 *   directly in the anchor directory (the TypeScript barrel convention) and barrels (P3 facades) directly in
 *   it; for declared modules, the files of their `entry` globs, or else the same rule in the members' common
 *   directory (D-43).
 * - **Public API** is the module's actual surface (D-63): the members that files of other modules import or
 *   re-export from. It is computed from `imports` and `re-exports` relationships only, as the IR's
 *   `ModuleEntity.publicApi` defines it: the linker also lifts `calls`, `references-type` and `implements`
 *   references through barrels to the declaring file, and counting those would list files nobody imports
 *   (clean-architecture's `src/domain/ports/member-repository.ts`), so that boundary-bypass analysis (M7)
 *   could no longer tell barrel use from deep imports.
 * - **Packages** are those of every member file, attached files included.
 *
 * Determinism: modules keep their order (declared by name, inferred by scope and key); every list is built
 * in file id order from sorted member lists or projection node order.
 */
import { baseName, parentPath, sortedUnique } from "@katedrala/ir";
import type { EdgeKind, FileId, ModuleId, PackageId } from "@katedrala/ir";
import { normalizeProjectionSpec } from "@katedrala/model";
import type { ArchitectureModel, ProjectionOptions } from "@katedrala/model";
import { commonDirectory } from "../directories.js";
import type { InferenceSettings, WeightedFileGraph } from "../types.js";
import { buildWeightedFileGraph } from "../weighted-graph.js";
import type { Attachments } from "./attach.js";
import type { DeclaredModules, InferredScope } from "./declared.js";
import { metricsEdgeKinds } from "./scopes.js";

/**
 * The relationship kinds that make a member part of the public API [DERIVED] (D-63; IR
 * `ModuleEntity.publicApi`). The set iterates in sorted order.
 */
export const PUBLIC_API_EDGE_KINDS: ReadonlySet<EdgeKind> = new Set<EdgeKind>([
  "imports",
  "re-exports",
]);

/** The surface of one module [DERIVED] (§3.12). Every list is sorted. */
export interface ModuleSurface {
  readonly entryPoints: readonly FileId[];
  readonly publicApi: readonly FileId[];
  readonly packages: readonly PackageId[];
}

/** The surfaces of every module [DERIVED] (P8). */
export interface ModuleSurfaces {
  /** Parallel to `declared.modules`. */
  readonly declared: readonly ModuleSurface[];
  /** `inferred[s][u]`: the surface of unit `u` of `inferred[s]`. */
  readonly inferred: readonly (readonly ModuleSurface[])[];
}

/** What {@link moduleSurface} reads [DERIVED] (P8, §3.12; D-43, D-63). */
export interface SurfaceInput {
  readonly model: ArchitectureModel;
  /** The node roles (`modules.fileRoles`) and the weighting, for the barrels of declared modules (D-43). */
  readonly settings: InferenceSettings;
  /** The metrics projection: its type-only setting and file roles admit public-API edges (D-63). */
  readonly projection: ProjectionOptions;
  readonly declared: DeclaredModules;
  /** The clustered scopes with their module identifiers, in scope order. */
  readonly inferred: readonly InferredScope[];
  /** P7's attachments: attached files are sources of public-API edges, never listed (D-63). */
  readonly attachments: Attachments;
}

/** The path of a file identifier (`file:<path>`). */
function pathOf(file: FileId): string {
  return file.slice("file:".length);
}

/** Whether a file is named `index.*`, the barrel convention of TypeScript and Node.js module resolution. */
function isIndexFile(path: string): boolean {
  return baseName(path).startsWith("index.");
}

/** Whether a node of a weighted file graph is a barrel: `reexportOutDegree · 2 ≥ admittedOutDegree > 0`. */
function isFacade(graph: WeightedFileGraph, file: FileId): boolean {
  const node = graph.indexOf(file);
  if (node === -1) return false;
  const admitted = graph.admittedOutDegree[node] ?? 0;
  return admitted > 0 && (graph.reexportOutDegree[node] ?? 0) * 2 >= admitted;
}

/** The sorted packages of files (files without a package contribute none). */
function packagesOf(model: ArchitectureModel, files: readonly FileId[]): PackageId[] {
  const packages: PackageId[] = [];
  for (const file of files) {
    const pkg = model.index.file(file)?.package;
    if (pkg !== undefined) packages.push(pkg);
  }
  return sortedUnique(packages);
}

/**
 * P8, the surface of every module [DERIVED] (§3.12; plan 4.4 P8; D-43, D-63):
 *
 * - **Entry points of inferred modules:** node members directly in the anchor directory that are named
 *   `index.*` or are barrels (P3 facades). Attached files are navigation only (§3.11) and never entry points.
 *   Stem modules usually have none: their members lie below the layer directories of their anchor.
 * - **Entry points of declared modules:** `entry ∩ members` when `entry` is configured. Otherwise D-43: the
 *   rule of inferred modules applied in the common directory of the members whose role is a node role
 *   (`modules.fileRoles`, production code by default), because declared modules have no anchor; tests and
 *   declarations elsewhere do not move that directory. Their barrels are recognized by the facade test of P3
 *   on the weighted file graph of the node roles without exclusion (the memoized projection of the module
 *   graph), which is built only when a declared module needs it.
 * - **Public API** (D-63): the members, node members only for inferred modules and every member for declared
 *   ones, that are the target of an `imports` or `re-exports` relationship whose source file is a member
 *   (node or attached) of a different module. Relationships are those of the metrics projection: its
 *   type-only setting and file roles, on the memoized projection `{ level: "file", edgeKinds: { imports,
 *   re-exports }, includeTypeOnly, fileRoles }`. Sources in no module do not count, and no confidence filter
 *   applies (the metrics projection has none).
 * - **Packages:** the packages of every member file, attached files included. Inferred modules never span
 *   packages; declared modules may.
 *
 * Complexity: O(n + m_imports) for the public API after the memoized projection, O(Σ members) for the rest;
 * O(n + m_IR) once for the declared barrels when needed. Determinism: file id order throughout.
 */
export function moduleSurface(input: SurfaceInput): ModuleSurfaces {
  const { model, settings, projection, declared, inferred, attachments } = input;

  // Who belongs where: `listed` members can be public API, attached files only use other modules (D-63).
  const listed = new Map<FileId, ModuleId>();
  const anyMember = new Map<FileId, ModuleId>();
  for (const module of declared.modules) {
    for (const file of module.files) {
      listed.set(file, module.id);
      anyMember.set(file, module.id);
    }
  }
  for (const { clustering, ids } of inferred) {
    const { nodes } = clustering.scope.graph;
    clustering.units.forEach((unit, index) => {
      const id = ids[index];
      if (id === undefined) return;
      for (const node of unit.members) {
        const file = nodes[node];
        if (file === undefined) continue;
        listed.set(file, id);
        anyMember.set(file, id);
      }
    });
  }
  for (const [file, id] of attachments.moduleOf) anyMember.set(file, id);

  // D-63: imports and re-exports admitted by the metrics projection's type-only setting and file roles.
  const metrics = normalizeProjectionSpec({ level: "file", ...projection });
  const imports = model.projection({
    level: "file",
    edgeKinds: PUBLIC_API_EDGE_KINDS,
    includeTypeOnly: metrics.includeTypeOnly,
    fileRoles: metrics.fileRoles,
  });
  const { graph } = imports;
  const isPublic = new Uint8Array(imports.nodes.length);
  imports.nodes.forEach((source, u) => {
    const from = anyMember.get(source as FileId);
    if (from === undefined) return;
    const end = graph.outOffsets[u + 1] ?? 0;
    for (let e = graph.outOffsets[u] ?? 0; e < end; e++) {
      const v = graph.outTargets[e] ?? -1;
      const target = imports.nodes[v];
      if (target === undefined) continue;
      const to = listed.get(target as FileId);
      if (to !== undefined && to !== from) isPublic[v] = 1;
    }
  });
  const publicApiOf = (members: readonly FileId[]): FileId[] =>
    members.filter((file) => isPublic[imports.indexOf(file)] === 1);

  // D-43: the barrels of declared modules without `entry`, on the graph of the node roles.
  let declaredGraph: WeightedFileGraph | undefined;
  const declaredSurfaces = declared.modules.map((module): ModuleSurface => {
    let entryPoints: FileId[];
    if (module.entry !== undefined) {
      const members = new Set(module.files);
      entryPoints = module.entry.filter((file) => members.has(file));
    } else {
      const candidates = module.files.filter((file) => {
        const role = model.index.file(file)?.role;
        return role !== undefined && settings.modules.fileRoles.has(role);
      });
      const directory = commonDirectory(candidates.map(pathOf));
      entryPoints = candidates.filter((file) => {
        const path = pathOf(file);
        if (parentPath(path) !== directory) return false;
        if (isIndexFile(path)) return true;
        declaredGraph ??= buildWeightedFileGraph(model, {
          ...settings.weighting,
          edgeKinds: metricsEdgeKinds(projection),
          fileRoles: settings.modules.fileRoles,
        });
        return isFacade(declaredGraph, file);
      });
    }
    return {
      entryPoints,
      publicApi: publicApiOf(module.files),
      packages: packagesOf(model, module.files),
    };
  });

  const inferredSurfaces = inferred.map(({ clustering }, scope) => {
    const { nodes } = clustering.scope.graph;
    const { facades } = clustering.classes;
    return clustering.units.map((unit, index): ModuleSurface => {
      const anchorDirectory = unit.anchor.directory;
      const members: FileId[] = [];
      const entryPoints: FileId[] = [];
      for (const node of unit.members) {
        const file = nodes[node];
        if (file === undefined) continue;
        members.push(file);
        const path = pathOf(file);
        if (parentPath(path) === anchorDirectory && (isIndexFile(path) || facades[node] === 1)) {
          entryPoints.push(file);
        }
      }
      const attached = (attachments.units[scope]?.[index] ?? []).map((entry) => entry.file);
      return {
        entryPoints,
        publicApi: publicApiOf(members),
        packages: packagesOf(model, [...members, ...attached]),
      };
    });
  });
  return { declared: declaredSurfaces, inferred: inferredSurfaces };
}
