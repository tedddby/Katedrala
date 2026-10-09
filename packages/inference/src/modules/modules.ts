/**
 * The module stage (§3; plan 4.4; docs/ALGORITHMS.md, "Modules"): declared modules [DERIVED] and modules
 * inferred by prior-anchored refinement [KATEDRALA HEURISTIC], each with its members, entry points, public
 * API and packages, and every inferred module with its confidence, evidence, reason and method string.
 *
 * The phases live in their own files; this module chains them in the order the plan fixes:
 *
 * 1. declared modules (`declared.ts`, §3.14): exact glob membership on the roles components own, overlaps by
 *    name with warnings (D-22–D-24, D-71);
 * 2. whether to infer at all (`scopes.ts`, D-21), then P0 (`scopes.ts`, §3.4): the nodes, their weighted
 *    graph and its restriction per scope (D-02, D-03);
 * 3. P1–P6 per scope (`cluster.ts`, U3, §3.5–§3.10), then the module identifiers, with `~inferred` on a
 *    collision with a declared name (`declared.ts`, §3.10);
 * 4. P7 (`attach.ts`, §3.11): tests and declarations attached for navigation by the policy of D-65;
 * 5. P8 (`surface.ts`, §3.12): entry points, public API from imports and re-exports (D-43, D-63), packages;
 * 6. P9 per scope (`confidence.ts`, `explain.ts`, §3.13, §5.2): measurements, evidence and reasons, and the
 *    `limit-reached` diagnostic of a scope whose reassignment stopped at the pass limit (D-37).
 *
 * Determinism: every phase is a pure function of the model, the settings, the declarations and the labels;
 * declared modules are resolved in name order, scopes are processed in identifier order, nodes ascending,
 * and the drafts come out in identifier order with every list sorted. No phase reads the clock, randomness
 * or the locale, and no unsorted Map or Set reaches the output.
 */
import { compareStrings } from "@katedrala/ir";
import type { Diagnostic, FileId, ModuleAnchor } from "@katedrala/ir";
import type { ClusteringContext, ModuleDraft, ModulesInput, ModulesResult } from "../types.js";
import { attachFiles } from "./attach.js";
import { clusterScope } from "./cluster.js";
import { moduleSignals } from "./confidence.js";
import { identifyInferredModules, resolveDeclaredModules } from "./declared.js";
import type { InferredScope } from "./declared.js";
import { explainScope, reassignmentLimitDiagnostic } from "./explain.js";
import { entryPointFiles, moduleScopes, shouldInferModules } from "./scopes.js";
import { moduleSurface } from "./surface.js";

/** A copy of an anchor with the keys in the order of the IR's `ModuleAnchor` and no absent `stem` key. */
function anchorOf(anchor: ModuleAnchor): ModuleAnchor {
  return anchor.stem === undefined
    ? { directory: anchor.directory }
    : { directory: anchor.directory, stem: anchor.stem };
}

/**
 * Element `index` of one of the phases' parallel arrays (surfaces, identifiers, explanations, node files). A
 * missing element is a defect of a phase, never a property of the input, so it is raised rather than
 * silently dropping a module or a member.
 */
function elementAt<T>(list: readonly T[] | undefined, index: number, what: string): T {
  const element = list?.[index];
  if (element === undefined) {
    throw new Error(`Module stage: the phases disagree, no ${what} at index ${index}`);
  }
  return element;
}

/**
 * Produce the modules of a repository (§3; plan 4.4, 6.4): declared modules [DERIVED] and inferred modules
 * [KATEDRALA HEURISTIC], without `components`, `dependencies` and `dependents`, which the pipeline fills
 * once every unit exists (cross-references, and `aggregateDependencies` on the metrics projection).
 *
 * - **Declared modules** (`input.declared`, the `modules` configuration section with its globs resolved by
 *   the engine) are always produced, also when module inference is disabled (D-21). Members are the matched
 *   files whose role is in `inference.components.file_roles` (D-22); a file several declared modules match
 *   belongs to the one whose name sorts first (D-23), with one `configuration-warning` per pair of modules
 *   (D-24); a module that matches no such file is kept empty with a `configuration-warning` (D-71). The
 *   warnings point at `input.configurationFile` when it is a snapshot file and list at most
 *   `limits.maxEvidenceEntities` paths. Declared modules have `origin: "declared"`, the id `mod:<name>`, no
 *   anchor and no `inference`; their entry points are the configured `entry` files among the members, else
 *   the index files and barrels in the members' common directory (D-43).
 * - **Inferred modules** are produced unless `inference.modules.enabled` is false, or `when_declared` is
 *   `none` and a module is declared (D-21). The nodes are the files with a role in
 *   `inference.modules.file_roles` that no declared module owns, partitioned by package (P0); each scope is
 *   clustered by P1–P6, with the per-file layer labels of the roles stage naming stem modules (D-39), the
 *   files of the document's entry points as composition-root candidates (D-31) and `input.repositoryName`
 *   naming root modules (D-38). A module's `files` are its node members plus the tests and declarations P7
 *   attached to it (D-65); its `anchor` is its prior's (§3.10); its entry points are the index files and
 *   barrels directly in the anchor directory; its `publicApi` lists the node members that other modules'
 *   files import or re-export from under the metrics projection's type-only setting and file roles (D-63);
 *   its `inference` carries the weighted signals of its kind, the context signals and an "Inferred:" reason
 *   (D-45–D-49, D-64, D-66, D-72), with `settings.methods.modules` as the method (D-56).
 *
 * Diagnostics: the declared modules' warnings (in module name order), then one `limit-reached` info per
 * scope whose reassignment stopped at `max_passes` with moves pending (D-37), in scope order. The engine
 * merges and sorts them with the other stages' diagnostics.
 *
 * Every file belongs to at most one module: declared members are not nodes (§3.14), every node belongs to
 * exactly one inferred module of its own scope, and attached files are neither nodes nor declared members.
 * Inferred modules never span packages, attached files included (§3.4, D-65); declared modules may.
 *
 * Complexity: O(n + m_IR) for the weighted graphs (memoized projections: the module nodes, and the
 * attachment and public-API projections), plus the phases: O(n · D + (passes + 1) · (n + m)) per scope for
 * P1–P6 with O(m_U log m_U) per Louvain pass of an oversized unit, O(F_attached · D + m_attached) for P7,
 * O(n + m_imports) for P8, O(n · D + m) for P9 and its texts, and O(M log M) to order M modules (§7, plan 4.7).
 * Memory O(n + m). Determinism: see the module comment; the result is independent of the order of every
 * array of the document and of `input.declared`.
 *
 * References: design §3 (prior-anchored refinement, §3.3–§3.16); plan 4.4 (P0–P9, the declared modules) and
 * 4.6 (evidence and reasons); IR `ModuleEntity` and docs/IR.md ("Identifiers", "Inference methods").
 *
 * @throws {RangeError} when two declared modules share a name, or (from `inferenceInfo`) when
 *   `limits.maxEvidenceEntities` is not a non-negative integer; the engine never produces either.
 * @throws {InvalidIdentifierError} (from `@katedrala/ir`) when a declared name is empty or contains `#` or
 *   `~`, which the engine's validator rejects.
 * @throws {Error} when the phases' results are not parallel to one another (a defect, never the input's).
 */
export function inferModules(input: ModulesInput): ModulesResult {
  const { model, settings, labels, projection, repositoryName, limits, configurationFile } = input;
  const maxEntities = limits.maxEvidenceEntities;

  // §3.14, D-22, D-23, D-24, D-71: declared modules first; their files are not inference nodes.
  const declared = resolveDeclaredModules({
    model,
    specs: input.declared,
    fileRoles: settings.componentFileRoles,
    maxExamples: maxEntities,
    ...(configurationFile === undefined ? {} : { configurationFile }),
  });
  const diagnostics: Diagnostic[] = [...declared.diagnostics];

  // D-21: `enabled: false` disables inferred modules even with declared ones; `when_declared: none` needs a
  // declared module. Declared modules are produced in every case.
  let inferred: readonly InferredScope[] = [];
  let entryPoints: ReadonlySet<FileId> = new Set<FileId>();
  if (shouldInferModules(settings.modules, declared.modules.length)) {
    // P0, D-02, D-03: one weighted graph over every node, restricted per scope; scopes in identifier order.
    const { scopes } = moduleScopes({
      model,
      settings,
      projection,
      declaredFiles: new Set(declared.owners.keys()),
    });
    // D-31: the files of the document's entry points; D-39: labels name stem modules; D-38: the repository
    // name names root modules outside packages.
    entryPoints = entryPointFiles(model);
    const context: ClusteringContext = { settings, labels, entryPoints, repositoryName };
    // P1–P6 per scope (U3), then `mod:<key>`, with `~inferred` on a collision with a declared name (§3.10).
    inferred = identifyInferredModules(
      scopes.map((scope) => clusterScope(scope, context)),
      declared,
    );
  }
  if (declared.modules.length === 0 && inferred.length === 0) return { modules: [], diagnostics };

  // P7 (D-41, D-42, D-65): tests and declarations attached to inferred modules of their own scope.
  const attachments = attachFiles({ model, settings, projection, declared, inferred });
  // P8 (D-43, D-63): entry points, public API from imports and re-exports, packages.
  const surfaces = moduleSurface({ model, settings, projection, declared, inferred, attachments });

  // Keys in the order of the IR's ModuleEntity; declared modules have no anchor and no inference (§3.14).
  const modules: ModuleDraft[] = declared.modules.map((module, index) => {
    const surface = elementAt(surfaces.declared, index, "declared module surface");
    return {
      id: module.id,
      name: module.name,
      origin: "declared",
      packages: [...surface.packages],
      files: [...module.files],
      entryPoints: [...surface.entryPoints],
      publicApi: [...surface.publicApi],
    };
  });

  inferred.forEach((scoped, scope) => {
    const { clustering, ids } = scoped;
    const { nodes } = clustering.scope.graph;
    const attached = elementAt(attachments.units, scope, "attachment list");
    // P9 (§3.13, D-45–D-47): the measurements of every unit on the scope's evidence graph.
    const signals = moduleSignals(clustering, entryPoints);
    // §5.2, plan 4.6 (D-48, D-49, D-56, D-64, D-66, D-72): evidence, reasons and the method string.
    const explanations = explainScope({
      scoped,
      signals,
      attachments: attached,
      settings,
      entryPoints,
      maxEntities,
    });
    // D-37: memberships of a scope that stopped at the pass limit may depend on it.
    const limit = reassignmentLimitDiagnostic(clustering);
    if (limit !== undefined) diagnostics.push(limit);

    clustering.units.forEach((unit, index) => {
      const surface = elementAt(surfaces.inferred[scope], index, "inferred module surface");
      // The node members, then the tests and declarations P7 attached, members for navigation only (§3.11,
      // D-65), merged into file id order.
      const files = [...unit.members].map((node) => elementAt(nodes, node, "scope node"));
      for (const attachment of elementAt(attached, index, "attachment list")) {
        files.push(attachment.file);
      }
      files.sort(compareStrings);
      // Keys in the order of the IR's ModuleEntity.
      modules.push({
        id: elementAt(ids, index, "module identifier"),
        name: unit.name,
        origin: "inferred",
        anchor: anchorOf(unit.anchor),
        packages: [...surface.packages],
        files,
        entryPoints: [...surface.entryPoints],
        publicApi: [...surface.publicApi],
        inference: elementAt(explanations, index, "explanation"),
      });
    });
  });

  // The IR's canonical order: modules by identifier.
  modules.sort((a, b) => compareStrings(a.id, b.id));
  return { modules, diagnostics };
}
