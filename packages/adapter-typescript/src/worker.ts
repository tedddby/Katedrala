/**
 * Worker-thread entry point of the TypeScript/JavaScript adapter (see `LanguageAdapter.workerModule`).
 */
import type { LanguageAdapter } from "@katedrala/plugin-api";
import { createTypeScriptAdapter } from "./adapter.js";
import { resolveTypeScriptAdapterOptions } from "./options.js";

/**
 * Create the adapter in a worker from the (cloned) options of the main-thread adapter.
 *
 * @throws {TypeScriptAdapterOptionsError} for invalid options.
 */
export function createAdapter(options: unknown): LanguageAdapter {
  return createTypeScriptAdapter(resolveTypeScriptAdapterOptions(options));
}
