/**
 * Collection of project-setup diagnostics: de-duplicated and reported in canonical order, so that the
 * order in which files happen to be read never shows in the output.
 */
import { compareStrings, fileId } from "@katedrala/ir";
import type { Diagnostic, DiagnosticCode, Severity } from "@katedrala/ir";
import { isInsideRoot } from "./locations.js";
import type { TextProblem } from "./json.js";

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  return (
    compareStrings(a.file ?? "", b.file ?? "") ||
    (a.line ?? 0) - (b.line ?? 0) ||
    (a.column ?? 0) - (b.column ?? 0) ||
    compareStrings(a.code, b.code) ||
    compareStrings(a.message, b.message) ||
    compareStrings(a.severity, b.severity)
  );
}

/** Accumulates diagnostics; identical diagnostics are kept once. */
export class DiagnosticCollector {
  readonly #items = new Map<string, Diagnostic>();

  /** Record a diagnostic (ignored when an identical one was recorded before). */
  add(diagnostic: Diagnostic): void {
    const key = JSON.stringify([
      diagnostic.file ?? "",
      diagnostic.line ?? 0,
      diagnostic.column ?? 0,
      diagnostic.code,
      diagnostic.severity,
      diagnostic.message,
    ]);
    if (!this.#items.has(key)) this.#items.set(key, diagnostic);
  }

  /**
   * Record a diagnostic about a configuration file. `path` is a loose path; files above the analysis root
   * have no file identifier, so their location is part of the message only.
   */
  addForFile(
    code: DiagnosticCode,
    severity: Severity,
    message: string,
    path: string | undefined,
    problem?: TextProblem,
  ): void {
    const diagnostic: Diagnostic = { code, severity, message };
    if (path !== undefined && path !== "" && isInsideRoot(path)) {
      diagnostic.file = fileId(path);
      if (problem?.line !== undefined) diagnostic.line = problem.line;
      if (problem?.column !== undefined) diagnostic.column = problem.column;
    }
    this.add(diagnostic);
  }

  /** Every recorded diagnostic in canonical order (file, line, column, code, message). */
  sorted(): Diagnostic[] {
    return [...this.#items.values()].sort(compareDiagnostics);
  }
}
