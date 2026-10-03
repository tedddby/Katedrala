/**
 * Aggregated dependencies between architectural units, in the IR's `AggregatedDependency` form (the
 * `dependencies` / `dependents` lists of packages, components, modules and layers).
 */
import { compareStrings, defaultLimits } from "@katedrala/ir";
import type { AggregatedDependency, EdgeId, EntityId } from "@katedrala/ir";
import { ModelError } from "./errors.js";
import { isAggregatedEntity } from "./identifiers.js";
import type { ArchitectureModel, ModelDocument } from "./model.js";
import type { ProjectionEdgeInfo } from "./projection.js";
import type { ProjectionLevel, ProjectionOptions } from "./spec.js";

/**
 * Levels whose units carry aggregated dependencies in the IR. Files and symbols do not: their dependency
 * lists are derived by `DocumentIndex`, and `AggregatedDependency.entity` cannot denote them.
 */
export type AggregationLevel = Exclude<ProjectionLevel, "symbol" | "file">;

/** Every {@link AggregationLevel}. */
export const AGGREGATION_LEVELS = [
  "component",
  "module",
  "layer",
  "package",
] as const satisfies readonly AggregationLevel[];

/** The aggregated dependencies and dependents of one unit, each sorted by `entity`. */
export interface UnitDependencies {
  /** One entry per unit this unit depends on (`entity` is the depended-upon unit). */
  dependencies: AggregatedDependency[];
  /** One entry per unit that depends on this unit (`entity` is the depending unit). */
  dependents: AggregatedDependency[];
}

/** The bound on `examples` when the document does not state one: the IR default (5). */
const DEFAULT_MAX_EXAMPLES = defaultLimits().maxExamplesPerDependency;

/** The number of examples to keep: the document's bound (non-negative integer), else the IR default. */
function exampleLimit(document: ModelDocument): number {
  const limit = document.limits?.maxExamplesPerDependency ?? DEFAULT_MAX_EXAMPLES;
  return Number.isNaN(limit) ? 0 : Math.max(0, Math.floor(limit));
}

/** Underlying edges by descending observations, then id, truncated to `limit`. */
function selectExamples(
  model: ArchitectureModel,
  edges: readonly EdgeId[],
  limit: number,
): EdgeId[] {
  if (limit === 0) return [];
  return edges
    .map((id) => ({ id, observations: model.index.edge(id)?.observations ?? 0 }))
    .sort((a, b) => b.observations - a.observations || compareStrings(a.id, b.id))
    .slice(0, limit)
    .map((example) => example.id);
}

function aggregated(
  entity: AggregatedDependency["entity"],
  info: ProjectionEdgeInfo,
  examples: readonly EdgeId[],
): AggregatedDependency {
  return {
    entity,
    edgeCount: info.edgeCount,
    observations: info.observations,
    runtimeEdgeCount: info.runtimeEdgeCount,
    kindCounts: { ...info.kindCounts },
    examples: [...examples],
  };
}

/** Identifiers of the units of a level listed in the document. */
function listedUnits(document: ModelDocument, level: AggregationLevel): EntityId[] {
  switch (level) {
    case "package":
      return document.packages.map((pkg) => pkg.id);
    case "component":
      return (document.components ?? []).map((component) => component.id);
    case "module":
      return (document.modules ?? []).map((module) => module.id);
    case "layer":
      return (document.layers ?? []).map((layer) => layer.id);
  }
}

/**
 * The aggregated dependencies of every unit at a level, computed on the projection
 * `{ ...options, includeExternals, level }` of the model (see {@link Projection} for the lifting rules):
 *
 * - Externals: `includeExternals` is `options.includeExternals` when given. It defaults to `true` at the
 *   `package` level, because the IR's package dependencies include the externals the package's files use
 *   (`PackageEntity.dependencies`), and to `false` at the other levels (a component's dependencies are on
 *   files of other components). Including externals only adds relationships with externals; those between
 *   units are the same either way, so the projection options of the metrics (`fromProjectionInfo`) give the
 *   IR's lists at every level.
 * - The result has an entry for every unit of the level listed in the document and for every node of the
 *   projection (including externals when they are included), in identifier order; units without
 *   relationships have empty lists.
 * - Every projection edge `A → B` yields one `AggregatedDependency` with `entity` B in A's `dependencies`
 *   and one with `entity` A in B's `dependents`: `edgeCount`, `observations`, `runtimeEdgeCount` and
 *   `kindCounts` (keys sorted) describe the underlying IR edges; `examples` lists them by descending
 *   observations, then id, truncated to `document.limits.maxExamplesPerDependency` (5 when the document
 *   has no limits).
 * - Lists are sorted by `entity`; every returned object is new (nothing is shared between entries).
 *
 * Relationships internal to a unit are not dependencies.
 *
 * @param options - projection options; a `level` property, if present, is ignored in favour of `level`.
 * @throws {ModelError} `invalid-level` when `level` is not one of {@link AGGREGATION_LEVELS}.
 */
export function aggregateDependencies(
  model: ArchitectureModel,
  level: AggregationLevel,
  options: ProjectionOptions = {},
): Map<EntityId, UnitDependencies> {
  if (!(AGGREGATION_LEVELS as readonly string[]).includes(level)) {
    throw new ModelError(
      "invalid-level",
      `Dependencies are aggregated at the ${AGGREGATION_LEVELS.join(", ")} levels, not at ${JSON.stringify(level)}`,
    );
  }
  const includeExternals = options.includeExternals ?? level === "package";
  const projection = model.projection({ ...options, includeExternals, level });
  const limit = exampleLimit(model.document);

  const units = new Set<EntityId>([...projection.nodes, ...listedUnits(model.document, level)]);
  const result = new Map<EntityId, UnitDependencies>();
  for (const unit of [...units].sort(compareStrings)) {
    result.set(unit, { dependencies: [], dependents: [] });
  }

  // Edges come in (source, target) order and node numbers follow identifier order, so both lists are
  // filled in `entity` order.
  for (const [source, target] of projection.graph.edges()) {
    const sourceId = projection.nodes[source];
    const targetId = projection.nodes[target];
    const info = projection.edgeInfo(source, target);
    // Unit-level nodes are packages, components, modules, layers or externals by construction; the guard
    // only skips identifiers of documents that violate the IR types.
    if (sourceId === undefined || targetId === undefined || info === undefined) continue;
    if (!isAggregatedEntity(sourceId) || !isAggregatedEntity(targetId)) continue;
    const examples = selectExamples(model, info.edges, limit);
    result.get(sourceId)?.dependencies.push(aggregated(targetId, info, examples));
    result.get(targetId)?.dependents.push(aggregated(sourceId, info, examples));
  }
  return result;
}
