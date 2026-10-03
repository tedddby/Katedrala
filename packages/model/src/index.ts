/**
 * @katedrala/model — the in-memory analysis substrate: a view over a (possibly partial) architecture
 * document with containment helpers, graph projections at the symbol, file, component, module, layer and
 * package levels, and aggregated dependencies between units.
 */
export { ArchitectureModel, type ModelDocument } from "./model.js";
export { Projection, type ProjectionEdgeInfo } from "./projection.js";
export {
  AGGREGATION_LEVELS,
  aggregateDependencies,
  type AggregationLevel,
  type UnitDependencies,
} from "./aggregate.js";
export {
  DEFAULT_EDGE_KINDS,
  DEFAULT_FILE_ROLES,
  PROJECTION_LEVELS,
  fromProjectionInfo,
  normalizeProjectionSpec,
  toProjectionInfo,
  type NormalizedProjectionSpec,
  type ProjectionLevel,
  type ProjectionOptions,
  type ProjectionSpec,
} from "./spec.js";
export { ModelError, type ModelErrorCode } from "./errors.js";
