/**
 * Helpers for producing diagnostics in canonical order.
 */
import { compareStrings, type Diagnostic } from "@katedrala/ir";

/**
 * The canonical order of diagnostics (docs/IR.md, "Ordering"): by file, line, column, code, message, then
 * severity. Diagnostics without a file sort first.
 */
export function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    compareStrings(a.file ?? "", b.file ?? "") ||
    (a.line ?? 0) - (b.line ?? 0) ||
    (a.column ?? 0) - (b.column ?? 0) ||
    compareStrings(a.code, b.code) ||
    compareStrings(a.message, b.message) ||
    compareStrings(a.severity, b.severity)
  );
}

/** A copy of the diagnostics in canonical order (see {@link compareDiagnostics}). */
export function sortDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort(compareDiagnostics);
}

/** `JSON.stringify` typed honestly: it returns undefined for `undefined`, functions and symbols. */
const stringify = JSON.stringify as (value: unknown) => string | undefined;

/** The message of an unknown thrown value, for reasons and diagnostics. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return stringify(error) ?? "unknown error";
  } catch {
    return "unknown error";
  }
}
