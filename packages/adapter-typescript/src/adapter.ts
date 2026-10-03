/**
 * The TypeScript/JavaScript language adapter.
 */
import type { AdapterProject, LanguageAdapter, ProjectContext } from "@katedrala/plugin-api";
import { detectTypeScriptLanguage, TYPESCRIPT_LANGUAGES } from "./languages.js";
import {
  extractTypeScriptFile,
  parseTypeScriptFile,
  type ParsedTypeScriptFile,
} from "./extract/index.js";
import { resolveTypeScriptAdapterOptions, type TypeScriptAdapterOptions } from "./options.js";

/** Identifier of the adapter. */
export const TYPESCRIPT_ADAPTER_ID = "typescript";

/**
 * Version of the adapter (semver). Part of the extraction cache key: bump it whenever extraction output
 * changes for some input.
 */
export const TYPESCRIPT_ADAPTER_VERSION = "1.0.0";

/** URL of the worker module exporting `createAdapter` (resolved next to this module). */
const WORKER_MODULE = new URL("./worker.js", import.meta.url).href;

/**
 * Create the TypeScript/JavaScript adapter: TypeScript (`.ts`, `.tsx`, `.mts`, `.cts`, `.d.ts`, `.d.mts`,
 * `.d.cts`) and JavaScript (`.js`, `.jsx`, `.mjs`, `.cjs`) files, parsed with the TypeScript 6 compiler API.
 * Options are validated and completed with defaults.
 *
 * @throws {TypeScriptAdapterOptionsError} for invalid options.
 */
export function createTypeScriptAdapter(
  options?: TypeScriptAdapterOptions,
): LanguageAdapter<ParsedTypeScriptFile> {
  const resolved = Object.freeze(resolveTypeScriptAdapterOptions(options));
  return {
    id: TYPESCRIPT_ADAPTER_ID,
    version: TYPESCRIPT_ADAPTER_VERSION,
    displayName: "TypeScript & JavaScript",
    languages: TYPESCRIPT_LANGUAGES,
    workerModule: WORKER_MODULE,
    options: resolved,
    detect: (input) => detectTypeScriptLanguage(input.path),
    parse: (input) => parseTypeScriptFile(input),
    extract: (parsed) => extractTypeScriptFile(parsed, resolved),
    createProject: async (context: ProjectContext): Promise<AdapterProject> => {
      // Loaded on demand: workers only parse and extract.
      const { createTypeScriptProject } = await import("./project/index.js");
      return createTypeScriptProject(context, resolved);
    },
  };
}
