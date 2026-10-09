/**
 * P7 of module inference: tests and declarations attached to inferred modules for navigation (§3.11; plan
 * 4.4 P7; docs/ALGORITHMS.md, "Modules", P7).
 *
 * Tests and declarations never influence inference, but people expect `payment.service.spec.ts` to appear
 * with its module (navigation, impact on tests, CodeVerse). Once memberships are final, each test and
 * declaration that is neither an inference node nor a declared member is attached by the attachment policy of
 * D-65:
 *
 * - its candidates are the distinct files it depends on (a test) or that depend on it (a declaration) that
 *   are members of any module: declared members and the node members of inferred modules of every scope;
 *   attached files are never candidates;
 * - a module holding a strict majority of the candidates takes the file when it is an inferred module of the
 *   file's own scope; a majority elsewhere (a declared module, another package) leaves the file unassigned,
 *   because declared membership is exact (§3.14) and inferred modules never span packages;
 * - without a majority, only a file whose role the metrics projection leaves out falls back on location
 *   (D-42): tests, unless `analysis.include_tests_in_metrics`. Declarations are always in the metrics
 *   projection. An attached file of a counted role takes part in the module's aggregated dependencies, so a
 *   location guess would invent dependencies; a strict majority keeps most of its edges inside its module.
 *
 * Every attachment records its rule, so that the module's `attached-files` evidence explains it (D-64).
 *
 * Determinism: files are visited in identifier order; candidates come from the CSR rows of a memoized
 * projection; the strict-majority module is unique, and location ties go to the smallest module identifier.
 */
import { compareStrings, parentPath } from "@katedrala/ir";
import type { FileId, FileRole, ModuleId } from "@katedrala/ir";
import type { ArchitectureModel, ProjectionOptions } from "@katedrala/model";
import { DirectoryTree } from "../directories.js";
import type { InferenceSettings } from "../types.js";
import { buildWeightedFileGraph } from "../weighted-graph.js";
import type { DeclaredModules, InferredScope } from "./declared.js";
import { metricsEdgeKinds } from "./scopes.js";

/** The roles of attached files [KATEDRALA HEURISTIC] (§3.11, D-65). */
export type AttachedRole = "test" | "declaration";

/**
 * How a file was attached [KATEDRALA HEURISTIC] (D-64): by a strict majority of its candidates (D-65), or by
 * location (D-42).
 */
export type AttachmentRule = "majority" | "location";

/** One file attached to an inferred module [KATEDRALA HEURISTIC] (§3.11, D-64, D-65). */
export interface Attachment {
  readonly file: FileId;
  readonly role: AttachedRole;
  readonly rule: AttachmentRule;
  /**
   * The distinct files the test depends on, or that depend on the declaration, that are members of a module
   * (declared members and inferred node members).
   */
  readonly candidates: number;
  /** How many candidates belong to the module the file is attached to (more than half by the majority rule). */
  readonly support: number;
  /** The location rule: the directory whose nodes decided (the file's directory or an ancestor). */
  readonly directory?: string;
}

/** The attachments of every inferred module [KATEDRALA HEURISTIC] (P7). */
export interface Attachments {
  /** `units[s][u]`: the files attached to unit `u` of `inferred[s]`, sorted by identifier. */
  readonly units: readonly (readonly Attachment[])[][];
  /** Every attached file and the identifier of its module. Iterate `units` where order matters. */
  readonly moduleOf: ReadonlyMap<FileId, ModuleId>;
}

/** What {@link attachFiles} reads [KATEDRALA HEURISTIC] (P7, §3.11; D-41, D-65). */
export interface AttachInput {
  readonly model: ArchitectureModel;
  readonly settings: InferenceSettings;
  /** The metrics projection: its edge kinds are those of the attachment graph (D-02, D-41). */
  readonly projection: ProjectionOptions;
  readonly declared: DeclaredModules;
  /** The clustered scopes with their module identifiers, in scope order. */
  readonly inferred: readonly InferredScope[];
}

/** The module a candidate belongs to; `scope` and `unit` are -1 for a declared module. */
interface Owner {
  readonly id: ModuleId;
  readonly scope: number;
  readonly unit: number;
}

/** Where the location rule looks in one scope: the directories of its nodes and the memoized winners. */
interface ScopeLocator {
  readonly tree: DirectoryTree;
  /** Directory → the unit with the most nodes directly in it (ties: smallest identifier), or -1. */
  readonly winners: Map<string, number>;
}

/**
 * P7, tests and declarations [KATEDRALA HEURISTIC] (§3.11; plan 4.4 P7; D-41, D-42, D-64, D-65):
 *
 * 1. The attachment graph is `buildWeightedFileGraph(model, { ...weighting, edgeKinds, fileRoles: nodeRoles ∪
 *    {test, declaration} })`, a separate (memoized) projection with the same weighting and confidence filter
 *    as the inference graph (D-41); arcs of weight 0 do not exist in it, so they are ignored.
 * 2. Every test (when `attachTests`) and declaration (when `attachDeclarations`) that is neither a node (its
 *    role is one of `modules.fileRoles`) nor a declared member is visited in identifier order (D-65):
 *    1. its candidates are its distinct dependencies (a test) or dependents (a declaration) that belong to a
 *       module: a declared member or a node member of an inferred module of any scope;
 *    2. a module holding a strict majority of the candidates takes the file when it is an inferred module of
 *       the file's scope (`FileEntity.package ?? ""`); otherwise the file stays unassigned, without location
 *       fallback;
 *    3. without a majority, a test falls back on location unless `modules.testsInMetrics`
 *       (`analysis.include_tests_in_metrics`); declarations never do (they are always in the metrics
 *       projection, `DEFAULT_FILE_ROLES`);
 *    4. location (D-42): the inferred module of the file's scope with the most nodes directly in the file's
 *       directory (ties: smallest identifier), then likewise for each ancestor up to the scope directory;
 *       else unassigned. Nodes directly in a directory count, not its subtree, so a big module elsewhere in
 *       the subtree does not win.
 *
 * Attached files stay out of module size, confidence and `publicApi` (§3.11, D-63).
 *
 * Complexity: O(n + m_IR) for the attachment graph (memoized projection), O(F_attached · D + m_attached) for
 * the attachments, the location winners memoized per directory. Determinism: identifier order; the strict
 * majority is unique; ties are decided by `compareStrings` on module identifiers.
 */
export function attachFiles(input: AttachInput): Attachments {
  const { model, settings, projection, declared, inferred } = input;
  const units = inferred.map(({ clustering }) => clustering.units.map((): Attachment[] => []));
  const moduleOf = new Map<FileId, ModuleId>();
  const {
    attachTests,
    attachDeclarations,
    testsInMetrics,
    fileRoles: nodeRoles,
  } = settings.modules;
  if ((!attachTests && !attachDeclarations) || inferred.length === 0) return { units, moduleOf };

  // D-65: the candidates are the members of every module, declared or inferred, of any scope; attached files
  // never are (they are added to `moduleOf` only).
  const owners = new Map<FileId, Owner>();
  for (const module of declared.modules) {
    for (const file of module.files) owners.set(file, { id: module.id, scope: -1, unit: -1 });
  }
  const scopeOf = new Map<string, number>();
  inferred.forEach(({ clustering, ids }, scope) => {
    scopeOf.set(clustering.scope.id, scope);
    const { nodes } = clustering.scope.graph;
    clustering.units.forEach((unit, index) => {
      const id = ids[index];
      if (id === undefined) return;
      for (const node of unit.members) {
        const file = nodes[node];
        if (file !== undefined) owners.set(file, { id, scope, unit: index });
      }
    });
  });

  // D-41: the attachment graph has the weighting and confidence filter of the inference graph.
  const attachment = buildWeightedFileGraph(model, {
    ...settings.weighting,
    edgeKinds: metricsEdgeKinds(projection),
    fileRoles: new Set<FileRole>([...nodeRoles, "declaration", "test"]),
  });
  const { graph } = attachment;
  const locators = new Map<number, ScopeLocator>();

  const attach = (owner: Owner, attached: Attachment): void => {
    units[owner.scope]?.[owner.unit]?.push(attached);
    moduleOf.set(attached.file, owner.id);
  };

  // `nodes` are sorted by identifier, so every unit's list is too.
  attachment.nodes.forEach((file, node) => {
    const entity = model.index.file(file);
    if (entity === undefined) return;
    const role = entity.role;
    if (role !== "test" && role !== "declaration") return;
    if (role === "test" ? !attachTests : !attachDeclarations) return;
    // D-65: nodes and declared members already belong to a module.
    if (nodeRoles.has(role) || declared.owners.has(file)) return;

    // A test's candidates are its dependencies, a declaration's its dependents.
    const [offsets, neighbors] =
      role === "test" ? [graph.outOffsets, graph.outTargets] : [graph.inOffsets, graph.inSources];
    const counts = new Map<ModuleId, { owner: Owner; count: number }>();
    let candidates = 0;
    const end = offsets[node + 1] ?? 0;
    for (let edge = offsets[node] ?? 0; edge < end; edge++) {
      const other = attachment.nodes[neighbors[edge] ?? -1];
      const owner = other === undefined ? undefined : owners.get(other);
      if (owner === undefined) continue;
      candidates++;
      const entry = counts.get(owner.id);
      if (entry === undefined) counts.set(owner.id, { owner, count: 1 });
      else entry.count++;
    }

    // A strict majority is held by at most one module, so the order of `counts` does not matter.
    let majority: { owner: Owner; count: number } | undefined;
    for (const entry of counts.values()) if (entry.count * 2 > candidates) majority = entry;
    const scope = scopeOf.get(entity.package ?? "");
    if (majority !== undefined) {
      // D-65: a majority to a declared module or to another scope leaves the file unassigned.
      if (majority.owner.scope !== -1 && majority.owner.scope === scope) {
        attach(majority.owner, {
          file,
          role,
          rule: "majority",
          candidates,
          support: majority.count,
        });
      }
      return;
    }
    // D-65: only files outside the metrics projection fall back on location.
    if (role !== "test" || testsInMetrics || scope === undefined) return;
    const scoped = inferred[scope];
    if (scoped === undefined) return;
    const located = locate(scoped, scope, parentPath(entity.path), locators);
    if (located === undefined) return;
    const id = scoped.ids[located.unit];
    if (id === undefined) return;
    attach(
      { id, scope, unit: located.unit },
      {
        file,
        role,
        rule: "location",
        candidates,
        support: counts.get(id)?.count ?? 0,
        directory: located.directory,
      },
    );
  });
  return { units, moduleOf };
}

/**
 * The location rule (D-42): starting at `directory`, the unit with the most scope nodes directly in the
 * directory (ties: the smallest module identifier), else the same for each ancestor up to the scope
 * directory. Undefined when no such directory holds a node.
 */
function locate(
  scoped: InferredScope,
  scope: number,
  directory: string,
  locators: Map<number, ScopeLocator>,
): { readonly unit: number; readonly directory: string } | undefined {
  const { clustering, ids } = scoped;
  let locator = locators.get(scope);
  if (locator === undefined) {
    // Node i of the scope is path i, so `directFiles` returns node numbers.
    const paths = clustering.scope.graph.nodes.map((file) => file.slice("file:".length));
    locator = { tree: DirectoryTree.fromPaths(paths), winners: new Map() };
    locators.set(scope, locator);
  }
  const scopeDirectory = clustering.scope.directory;
  for (let current = directory; ; current = parentPath(current)) {
    let winner = locator.winners.get(current);
    if (winner === undefined) {
      winner = directWinner(locator.tree.directFiles(current), clustering.unitOf, ids);
      locator.winners.set(current, winner);
    }
    if (winner !== -1) return { unit: winner, directory: current };
    if (current === scopeDirectory || current === "") return undefined;
  }
}

/** The unit holding the most of `nodes` (ties: smallest module identifier), or -1 when `nodes` is empty. */
function directWinner(
  nodes: readonly number[],
  unitOf: Int32Array,
  ids: readonly ModuleId[],
): number {
  const counts = new Map<number, number>();
  for (const node of nodes) {
    const unit = unitOf[node] ?? -1;
    if (unit !== -1) counts.set(unit, (counts.get(unit) ?? 0) + 1);
  }
  let winner = -1;
  let most = 0;
  // Every candidate is compared with the current winner by count, then identifier: order-independent.
  for (const [unit, count] of counts) {
    if (
      count > most ||
      (count === most && compareStrings(ids[unit] ?? "", ids[winner] ?? "") < 0)
    ) {
      winner = unit;
      most = count;
    }
  }
  return winner;
}
