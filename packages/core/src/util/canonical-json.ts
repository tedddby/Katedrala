/**
 * Canonical JSON: the serialization used wherever a value feeds a digest (configuration, adapter options).
 *
 * The implementation moved to `@katedrala/ir` in milestone 5, so that packages without a core dependency
 * (inference method strings) hash with the same function. Core re-exports it unchanged: its public API and
 * every digest it computes are byte-identical.
 */
export { canonicalJson } from "@katedrala/ir";
