/**
 * @katedrala/inference — architectural inference: components [DERIVED], and architectural roles, modules
 * and layers [KATEDRALA HEURISTIC], each inferred conclusion with confidence, evidence and a method
 * identifier. It depends on `@katedrala/ir`, `@katedrala/graph` and `@katedrala/model` only and runs in any
 * JavaScript environment; lint enforces both (no Node.js APIs, no zod, no other workspace package). The
 * engine validates the `modules`, `layers` and `inference` configuration sections, resolves their globs and
 * passes typed settings and file lists (ADR-013).
 *
 * The public API (plan 3.3):
 *
 * - `inferArchitecture`, the pipeline, and `withRoles`, which merges its roles into the files;
 * - `resolveInferenceSettings` with `DEFAULT_INFERENCE_CONFIGURATION`, `INFERENCE_KEYS` and
 *   `normalizeVocabularyName`, which the engine's validators use;
 * - `sStem`, the normalization the vocabularies apply;
 * - the configuration, declaration, settings, input and result types.
 *
 * Everything else is internal. See docs/ALGORITHMS.md for the algorithms and docs/IR.md for the output.
 */
export type {
  ComponentInferenceConfiguration,
  ConfiguredRoleSpec,
  DeclaredLayerConfiguration,
  DeclaredLayerSpec,
  DeclaredModuleConfiguration,
  DeclaredModuleSpec,
  Declarations,
  EdgeWeighting,
  InferenceConfiguration,
  InferenceInput,
  InferenceResult,
  InferenceSettings,
  LayerInferenceConfiguration,
  LayerSettings,
  LayersConfiguration,
  ModuleInferenceConfiguration,
  ModuleSettings,
  ModulesConfiguration,
  Vocabulary,
} from "./types.js";
export { inferArchitecture } from "./infer.js";
// Plan 3.2: the engine merges the inferred roles into the files with it (plan 3.3 omitted it; U2, U5).
export { withRoles } from "./roles.js";
export {
  DEFAULT_INFERENCE_CONFIGURATION,
  INFERENCE_KEYS,
  normalizeVocabularyName,
  resolveInferenceSettings,
} from "./settings.js";
export { sStem } from "./lexical.js";
