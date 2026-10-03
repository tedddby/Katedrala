/**
 * @katedrala/adapter-typescript — the TypeScript and JavaScript language adapter for Katedrala, built on the
 * TypeScript 6 compiler API: per-file extraction of symbols, imports, exports, references and facts, and
 * tsconfig/package.json-aware project setup and module resolution.
 */
export {
  createTypeScriptAdapter,
  TYPESCRIPT_ADAPTER_ID,
  TYPESCRIPT_ADAPTER_VERSION,
} from "./adapter.js";
export type { ParsedTypeScriptFile } from "./extract/index.js";
export {
  TYPESCRIPT_LANGUAGES,
  detectTypeScriptLanguage,
  type TypeScriptDialect,
  type TypeScriptLanguageDetection,
  type TypeScriptLanguageId,
} from "./languages.js";
export {
  DEFAULT_TYPESCRIPT_ADAPTER_OPTIONS,
  TypeScriptAdapterOptionsError,
  resolveTypeScriptAdapterOptions,
  type ResolvedTypeScriptAdapterOptions,
  type TypeScriptAdapterOptions,
} from "./options.js";
export * from "./project/index.js";
