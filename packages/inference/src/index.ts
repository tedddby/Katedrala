/**
 * @katedrala/inference — architectural inference: components [DERIVED], and architectural roles, modules
 * and layers [KATEDRALA HEURISTIC], each inferred conclusion with confidence, evidence and a method
 * identifier. It depends on `@katedrala/ir`, `@katedrala/graph` and `@katedrala/model` only and runs in any
 * JavaScript environment; lint enforces both (no Node.js APIs, no zod, no other workspace package). The
 * engine validates the `modules`, `layers` and `inference` configuration sections, resolves their globs and
 * passes typed settings and file lists (ADR-013).
 *
 * This entry point currently exports the configuration types, the declarations, the effective settings and
 * their resolution, which the engine's validators need; the inference pipeline itself is added with
 * `inferArchitecture`. See docs/ALGORITHMS.md for the algorithms and docs/IR.md for the output.
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
export {
  DEFAULT_INFERENCE_CONFIGURATION,
  INFERENCE_KEYS,
  normalizeVocabularyName,
  resolveInferenceSettings,
} from "./settings.js";
export { sStem } from "./lexical.js";
