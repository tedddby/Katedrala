/**
 * Diagnostics collected while linking. Library code never logs: every problem becomes a diagnostic.
 */
import type { Diagnostic } from "@katedrala/ir";
import { compareDiagnostics } from "./order.js";

/** The message of an error value, for diagnostics about failing plugins. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "unknown error";
}

/** Collects diagnostics; plugin errors are reported once per key. */
export class DiagnosticSink {
  readonly #diagnostics: Diagnostic[] = [];
  readonly #pluginErrorKeys = new Set<string>();

  /** Record a diagnostic. */
  add(diagnostic: Diagnostic): void {
    this.#diagnostics.push(diagnostic);
  }

  /**
   * Record a `plugin-error` diagnostic unless one with the same key was recorded already (a failing resolver
   * would otherwise produce one diagnostic per call).
   */
  pluginError(key: string, message: string, severity: Diagnostic["severity"] = "error"): void {
    if (this.#pluginErrorKeys.has(key)) return;
    this.#pluginErrorKeys.add(key);
    this.#diagnostics.push({ code: "plugin-error", severity, message });
  }

  /** Every diagnostic in canonical order. */
  sorted(): Diagnostic[] {
    return [...this.#diagnostics].sort(compareDiagnostics);
  }
}
