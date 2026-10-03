/**
 * @katedrala/linker — module resolution and cross-file binding.
 *
 * Turns per-file extractions (`FileExtraction`) and the adapters' project knowledge (`AdapterProject`) into
 * the structural part of an architecture document: directories, packages, files with resolved imports and
 * exports, symbols, externals, typed edges with provenance, entry points, diagnostics and statistics. The
 * linker is language-neutral: it knows only the plugin-api and IR contracts.
 */
export { link } from "./link.js";
export { LinkerError, type LinkerErrorCode } from "./errors.js";
export type { LinkFile, LinkInput, LinkProject, LinkResult } from "./types.js";
