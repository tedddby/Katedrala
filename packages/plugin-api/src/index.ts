/**
 * @katedrala/plugin-api — contracts for extending Katedrala: language adapters, snapshot sources,
 * framework detectors, exporters, metrics, anomaly detectors and rule evaluators.
 *
 * Third-party plugins depend only on this package and `@katedrala/ir`.
 */
export type * from "./source.js";
export type * from "./extraction.js";
export type * from "./framework.js";
export type * from "./extensions.js";
export {
  PLUGIN_API_VERSION,
  type AdapterProject,
  type DetectInput,
  type EntryPointDescriptor,
  type LanguageAdapter,
  type LanguageAdapterFactory,
  type LanguageDetection,
  type LanguageInfo,
  type LinkView,
  type ModuleRequest,
  type ModuleResolution,
  type NameCandidate,
  type NameResolver,
  type PackageDescriptor,
  type ParseInput,
  type ProjectContext,
} from "./adapter.js";
export {
  definePlugin,
  silentLogger,
  type KatedralaPlugin,
  type LogLevel,
  type Logger,
} from "./plugin.js";
export { SymbolNamer, type SymbolDeclarationInput } from "./symbols.js";
