/**
 * The inference pipeline (plan 2.3, 3.2; docs/ALGORITHMS.md): components [DERIVED], architectural roles and
 * per-file layer labels, modules and layers [KATEDRALA HEURISTIC when inferred], chained in the order their
 * inputs require, then cross-referenced and given their aggregated dependencies on the metrics projection.
 *
 * Determinism: every stage is a pure function of the model, the settings and the declarations; the stages
 * return their results in canonical order, cross-references are sorted, and aggregated dependencies come
 * from `aggregateDependencies`, which iterates in identifier order. Nothing here reads the clock,
 * randomness or the locale, and no unsorted Map or Set reaches the result.
 */
import { compareStrings, defaultLimits } from "@katedrala/ir";
import type {
  ComponentEntity,
  ComponentId,
  Diagnostic,
  EntityId,
  FileId,
  LayerEntity,
  ModuleEntity,
  ModuleId,
} from "@katedrala/ir";
import {
  ArchitectureModel,
  aggregateDependencies,
  fromProjectionInfo,
  toProjectionInfo,
} from "@katedrala/model";
import type { AggregationLevel, ProjectionOptions, UnitDependencies } from "@katedrala/model";
import { inferComponents } from "./components.js";
import { inferLayers } from "./layers/layers.js";
import { inferModules } from "./modules/modules.js";
import { inferRoles, withRoles } from "./roles.js";
import type {
  ComponentDraft,
  InferenceInput,
  InferenceResult,
  LayerDraft,
  ModuleDraft,
} from "./types.js";

/** The cross-references between components and modules, each list sorted by identifier. */
interface CrossReferences {
  /** Per component: the modules owning at least one owned file of its subtree. */
  readonly modulesOfComponent: ReadonlyMap<ComponentId, readonly ModuleId[]>;
  /** Per module: the components directly owning at least one of its member files. */
  readonly componentsOfModule: ReadonlyMap<ModuleId, readonly ComponentId[]>;
}

/**
 * The cross-references between components and modules [DERIVED] (IR `ComponentEntity.modules` and
 * `ModuleEntity.components`):
 *
 * - a module's components are the components that directly own one of its member files (a file is owned by
 *   the component of its own directory, plan 4.2); member files that no component owns (a role outside
 *   `inference.components.file_roles`) contribute none;
 * - a component's modules are the modules owning at least one owned file of its subtree: the modules of its
 *   own files and those of every descendant component.
 *
 * Both relations therefore agree: a module lists a component exactly when the component lists the module
 * among the modules of its own files. Complexity: O(F + C · M') time for F member files, C components and M'
 * modules per component path (a walk up the parents stops at the first ancestor that already lists the
 * module), O(C + M) memory. Determinism: every list is sorted by `compareStrings`.
 */
function crossReferences(
  components: readonly ComponentDraft[],
  modules: readonly ModuleDraft[],
): CrossReferences {
  const ownerOf = new Map<FileId, ComponentDraft>();
  const byId = new Map<ComponentId, ComponentDraft>();
  for (const component of components) {
    byId.set(component.id, component);
    for (const file of component.files) ownerOf.set(file, component);
  }
  const modulesOf = new Map<ComponentId, Set<ModuleId>>();
  const componentsOf = new Map<ModuleId, Set<ComponentId>>();
  for (const module of modules) {
    const owners = new Set<ComponentId>();
    componentsOf.set(module.id, owners);
    for (const file of module.files) {
      const owner = ownerOf.get(file);
      if (owner === undefined) continue;
      owners.add(owner.id);
      // The module belongs to the owner's subtree and to the subtree of every ancestor. Once a component
      // lists it, all of its ancestors do too, so the walk stops there.
      let current: ComponentDraft | undefined = owner;
      while (current !== undefined) {
        let listed = modulesOf.get(current.id);
        if (listed === undefined) {
          listed = new Set<ModuleId>();
          modulesOf.set(current.id, listed);
        }
        if (listed.has(module.id)) break;
        listed.add(module.id);
        current = current.parent === undefined ? undefined : byId.get(current.parent);
      }
    }
  }
  const sorted = <K, V extends string>(map: ReadonlyMap<K, ReadonlySet<V>>): Map<K, V[]> =>
    new Map([...map].map(([key, values]) => [key, [...values].sort(compareStrings)]));
  return { modulesOfComponent: sorted(modulesOf), componentsOfModule: sorted(componentsOf) };
}

/** A component in the key order of the IR's `ComponentEntity`, with the given dependency lists. */
function componentEntity(
  draft: ComponentDraft,
  modules: readonly ModuleId[],
  dependencies: UnitDependencies,
): ComponentEntity {
  const { id, name, kind, path, packages, parent, children, files, totals } = draft;
  return {
    id,
    name,
    kind,
    path,
    packages: [...packages],
    ...(parent === undefined ? {} : { parent }),
    children: [...children],
    files: [...files],
    totals: { ...totals },
    modules: [...modules],
    dependencies: dependencies.dependencies,
    dependents: dependencies.dependents,
  };
}

/** A module in the key order of the IR's `ModuleEntity`, with the given dependency lists. */
function moduleEntity(
  draft: ModuleDraft,
  components: readonly ComponentId[],
  dependencies: UnitDependencies,
): ModuleEntity {
  const { id, name, origin, anchor, packages, files, entryPoints, publicApi, inference } = draft;
  return {
    id,
    name,
    origin,
    ...(anchor === undefined ? {} : { anchor }),
    packages: [...packages],
    files: [...files],
    components: [...components],
    entryPoints: [...entryPoints],
    publicApi: [...publicApi],
    ...(inference === undefined ? {} : { inference }),
    dependencies: dependencies.dependencies,
    dependents: dependencies.dependents,
  };
}

/** A layer in the key order of the IR's `LayerEntity`, with the given dependency lists. */
function layerEntity(draft: LayerDraft, dependencies: UnitDependencies): LayerEntity {
  const { id, name, origin, rank, files, inference } = draft;
  return {
    id,
    name,
    origin,
    rank,
    files: [...files],
    ...(inference === undefined ? {} : { inference }),
    dependencies: dependencies.dependencies,
    dependents: dependencies.dependents,
  };
}

/** Empty dependency lists, for the units model (D-60). */
function noDependencies(): UnitDependencies {
  return { dependencies: [], dependents: [] };
}

/**
 * The aggregated dependencies of a unit. `aggregateDependencies` lists every unit of the document, so the
 * fallback only covers a unit it could not list (none in practice).
 */
function dependenciesOf(
  aggregated: ReadonlyMap<EntityId, UnitDependencies>,
  unit: EntityId,
): UnitDependencies {
  return aggregated.get(unit) ?? noDependencies();
}

/**
 * The metrics projection as milestone 6 records it in `metrics.projection` (`ProjectionInfo`): edge kinds,
 * type-only setting and file roles with their defaults applied. `includeExternals` is not part of it, so
 * aggregated dependencies between components, modules and layers never list externals, as the IR defines
 * them ("dependencies of directly owned files on files directly owned by other components").
 */
function metricsProjection(projection: ProjectionOptions): ProjectionOptions {
  return fromProjectionInfo(toProjectionInfo(projection));
}

/** The canonical order of diagnostics (docs/IR.md, "Ordering"): file, line, column, code, message, severity. */
function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    compareStrings(a.file ?? "", b.file ?? "") ||
    (a.line ?? 0) - (b.line ?? 0) ||
    (a.column ?? 0) - (b.column ?? 0) ||
    compareStrings(a.code, b.code) ||
    compareStrings(a.message, b.message) ||
    compareStrings(a.severity, b.severity)
  );
}

/**
 * Infer the architectural view of a repository (design §2–§5; plan 2.3, 3.2): components [DERIVED], and
 * architectural roles, modules and layers [KATEDRALA HEURISTIC when inferred; declared modules and layers are
 * exact], every inferred module and layer with its confidence, evidence, an "Inferred:" reason (D-66) and a
 * method string (D-56).
 *
 * The stages run in the order their inputs require:
 *
 * 1. components (`inferComponents`, §2): the directories that hold owned code, with
 *    `inference.components.file_roles` as the owned roles;
 * 2. roles and per-file layer labels (`inferRoles`, §4.2): naming, location and configured roles of `source`
 *    files, with the configured role globs of the declarations; the labels feed modules (stem names, D-39)
 *    and layers;
 * 3. modules (`inferModules`, §3): the declared modules, then prior-anchored refinement P0–P9 of every other
 *    node, with attachments, surfaces and evidence;
 * 4. layers (`inferLayers`, §4.3–§4.5): the declared layers, or layers inferred from the labels and ranked by
 *    the observed layer graph;
 * 5. cross-references: a module's `components` are the components directly owning one of its files; a
 *    component's `modules` are the modules owning a file of its subtree;
 * 6. aggregated dependencies (`aggregateDependencies`, §2.3, §3.12): the `dependencies` and `dependents` of
 *    every component, module and layer, lifted from the file relationships of the metrics projection
 *    (`input.projection`: its edge kinds, type-only setting and file roles; externals excluded), over a
 *    model of the structure plus the final units (`unitsModel`, D-60). Attached declarations, and tests when
 *    the metrics count tests, therefore take part in module dependencies (D-65).
 *
 * Existing components, modules and layers of the input document, and its `naming`, `location` and
 * `configuration` role entries, are ignored (D-20): running inference on its own output gives the same
 * result. Framework detector role entries are votes and are kept. `roles` holds the inferred entries per
 * file (the engine merges them with `withRoles`); `diagnostics` are the configuration warnings of declared
 * modules and layers and the `limit-reached` notices of module reassignment, in canonical order.
 *
 * Complexity: O(n + m_IR) for the weighted file graphs (at most three memoized projections), plus the stages
 * (docs/ALGORITHMS.md, "Complexity and scale"): components O(F · D); roles O(F + Σ path depth + classes);
 * modules O(n · D + (passes + 1) · (n + m)) per scope plus O(m_U log m_U) per Louvain pass of an oversized
 * unit; layers O(F + m + Σ 2^k k² + L³); one more model build and O(m_metrics) per aggregation level (D-60).
 * Memory O(size of the document).
 *
 * Determinism: the result is a pure function of the input, independent of the order of every array of the
 * document; it is canonical as produced (`canonicalizeDocument` of the merged document changes nothing).
 *
 * References: design §2–§5; plan 2.3, 3.1, 3.2, 4.7 (D-60), 4.8; docs/ALGORITHMS.md; docs/IR.md
 * ("Architecture", "Inference methods").
 *
 * @throws {RangeError} (from the module stage) when two declared modules share a name, which the engine's
 *   validator rejects.
 * @throws {InvalidIdentifierError} (from `@katedrala/ir`) when a declared module name is empty or contains `#`
 *   or `~`, which the engine's validator rejects.
 */
export function inferArchitecture(input: InferenceInput): InferenceResult {
  const { model, settings, declarations, projection, repositoryName } = input;
  const limits = model.document.limits ?? defaultLimits();
  const configurationFile =
    declarations.configurationFile === undefined
      ? {}
      : { configurationFile: declarations.configurationFile };

  // 1. Components [DERIVED] (§2, D-12, D-13).
  const componentDrafts = inferComponents({
    model,
    fileRoles: settings.componentFileRoles,
    repositoryName,
  });
  // 2. Roles and labels (§4.2, D-14–D-20): configured roles are restricted to source files there (D-17).
  const { roles, labels } = inferRoles({ model, settings, configured: declarations.roles });
  // 3. Modules (§3): declared first (D-21–D-24, D-71), then P0–P9; labels name stem modules (D-39).
  const moduleStage = inferModules({
    model,
    settings,
    declared: declarations.modules,
    labels,
    projection,
    repositoryName,
    limits,
    ...configurationFile,
  });
  // 4. Layers (§4.3–§4.5): declared (D-50, D-71) or inferred from the same labels (D-51–D-55).
  const layerStage = inferLayers({
    model,
    settings,
    projection,
    labels,
    ...(declarations.layers === undefined ? {} : { declared: declarations.layers }),
    limits,
    ...configurationFile,
  });

  // 5. Cross-references between components and modules.
  const { modulesOfComponent, componentsOfModule } = crossReferences(
    componentDrafts,
    moduleStage.modules,
  );
  const modulesOf = (component: ComponentId): readonly ModuleId[] =>
    modulesOfComponent.get(component) ?? [];
  const componentsOf = (module: ModuleId): readonly ComponentId[] =>
    componentsOfModule.get(module) ?? [];

  // 6. D-60: one model over the structure plus the final units with empty dependency lists, on which the
  // dependencies are aggregated (and which milestone 6 reuses for unit-level projections). Earlier units of
  // the input document are replaced, never merged (D-20).
  const unitsModel = ArchitectureModel.from({
    ...model.document,
    files: withRoles(model.document.files, roles),
    components: componentDrafts.map((draft) =>
      componentEntity(draft, modulesOf(draft.id), noDependencies()),
    ),
    modules: moduleStage.modules.map((draft) =>
      moduleEntity(draft, componentsOf(draft.id), noDependencies()),
    ),
    layers: layerStage.layers.map((draft) => layerEntity(draft, noDependencies())),
  });
  const metrics = metricsProjection(projection);
  const aggregated = (level: AggregationLevel): Map<EntityId, UnitDependencies> =>
    aggregateDependencies(unitsModel, level, metrics);
  const byComponent = aggregated("component");
  const byModule = aggregated("module");
  const byLayer = aggregated("layer");

  return {
    roles,
    components: componentDrafts.map((draft) =>
      componentEntity(draft, modulesOf(draft.id), dependenciesOf(byComponent, draft.id)),
    ),
    modules: moduleStage.modules.map((draft) =>
      moduleEntity(draft, componentsOf(draft.id), dependenciesOf(byModule, draft.id)),
    ),
    layers: layerStage.layers.map((draft) => layerEntity(draft, dependenciesOf(byLayer, draft.id))),
    diagnostics: [...moduleStage.diagnostics, ...layerStage.diagnostics].sort(compareDiagnostics),
    unitsModel,
  };
}
