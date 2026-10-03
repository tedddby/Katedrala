/**
 * Canonical orders of the arrays the linker produces (docs/IR.md, "Ordering and determinism"). They mirror
 * the comparators `canonicalizeDocument` applies, so linker output is already canonical.
 */
import { compareStrings } from "@katedrala/ir";
import type {
  Diagnostic,
  EntryPointEntry,
  ExportEntry,
  LanguageSummary,
  PackageDependency,
} from "@katedrala/ir";

/** Order by `id`. */
export function compareById(a: { readonly id: string }, b: { readonly id: string }): number {
  return compareStrings(a.id, b.id);
}

/** `FileEntity.exports`: by name, `from`, `typeOnly`, symbols, then target. */
export function compareExportEntries(a: ExportEntry, b: ExportEntry): number {
  return (
    compareStrings(a.name, b.name) ||
    compareStrings(a.from ?? "", b.from ?? "") ||
    Number(a.typeOnly) - Number(b.typeOnly) ||
    compareStrings((a.symbols ?? []).join("\n"), (b.symbols ?? []).join("\n")) ||
    compareStrings(a.target ?? "", b.target ?? "")
  );
}

const SCOPE_ORDER: Readonly<Record<string, number>> = {
  production: 0,
  peer: 1,
  optional: 2,
  build: 3,
  provided: 4,
  development: 5,
};

/** `PackageEntity.declaredDependencies`: by name, scope, version range, then target. */
export function comparePackageDependencies(a: PackageDependency, b: PackageDependency): number {
  return (
    compareStrings(a.name, b.name) ||
    (SCOPE_ORDER[a.scope] ?? 9) - (SCOPE_ORDER[b.scope] ?? 9) ||
    compareStrings(a.scope, b.scope) ||
    compareStrings(a.versionRange, b.versionRange) ||
    compareStrings(a.target, b.target)
  );
}

/** `entryPoints`: by entity, kind, source, package, then `mappedFrom`. */
export function compareEntryPoints(a: EntryPointEntry, b: EntryPointEntry): number {
  return (
    compareStrings(a.entity, b.entity) ||
    compareStrings(a.kind, b.kind) ||
    compareStrings(a.source, b.source) ||
    compareStrings(a.package ?? "", b.package ?? "") ||
    compareStrings(a.mappedFrom ?? "", b.mappedFrom ?? "")
  );
}

/** `diagnostics`: by file, line, column, code, message, then severity. */
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

/** `repository.languages`: by descending line count, then language. */
export function compareLanguages(a: LanguageSummary, b: LanguageSummary): number {
  return b.lines - a.lines || compareStrings(a.language, b.language);
}
