/**
 * Canonical ordering and serialization of documents.
 *
 * Determinism is a contract: the same inputs must produce byte-identical output. Producers keep collections
 * in canonical order at every stage boundary and call {@link canonicalizeDocument} before serializing. It
 * applies the total orders documented in docs/IR.md ("Ordering"), sorts the keys of record-typed fields,
 * and rejects duplicate identifiers.
 */
import type { AggregatedDependency, ComponentEntity, ModuleEntity } from "./types/architecture.js";
import type { SourceLocation } from "./types/common.js";
import type { ArchitectureDocument } from "./types/document.js";
import type { EdgeEntity, Provenance } from "./types/edges.js";
import type { Anomaly, Diagnostic, RuleViolation } from "./types/findings.js";
import type { EntropyFactor, MetricsReport, UnitMetrics } from "./types/metrics.js";
import type {
  EntryPointEntry,
  ExportEntry,
  FileEntity,
  PackageDependency,
  PackageEntity,
  SymbolEntity,
} from "./types/structure.js";
import { compareStrings } from "./ids.js";

/** Significant digits kept by {@link roundMetric}. */
export const METRIC_SIGNIFICANT_DIGITS = 9;

/**
 * Round a real-valued measurement for publication to a fixed number of significant digits (ECMAScript's
 * `toPrecision` is exactly specified, so results are identical everywhere). Unlike fixed decimal places,
 * significant digits preserve small values such as normalized centralities on large graphs. `-0` becomes
 * `0`.
 *
 * @throws {RangeError} for non-finite values, which never belong in a document.
 */
export function roundMetric(value: number, digits: number = METRIC_SIGNIFICANT_DIGITS): number {
  if (!Number.isFinite(value)) throw new RangeError(`Cannot publish non-finite value ${value}`);
  if (value === 0) return 0;
  const rounded = Number(value.toPrecision(digits));
  return rounded === 0 ? 0 : rounded;
}

/** Error thrown when an entity array contains the same identifier twice. */
export class DuplicateIdError extends Error {
  constructor(
    readonly collection: string,
    readonly id: string,
  ) {
    super(`Duplicate id in ${collection}: ${id}`);
    this.name = "DuplicateIdError";
  }
}

/** Sort items by their `id` in canonical order (returns a new array). */
export function sortById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => compareStrings(a.id, b.id));
}

/** Throw when two consecutive items of a sorted array share a key. */
function assertUniqueSorted<T>(
  sorted: readonly T[],
  keyOf: (item: T) => string,
  collection: string,
): void {
  let previous: string | undefined;
  for (const item of sorted) {
    const key = keyOf(item);
    if (key === previous) throw new DuplicateIdError(collection, key);
    previous = key;
  }
}

function sortUniqueById<T extends { id: string }>(collection: string, items: readonly T[]): T[] {
  const sorted = sortById(items);
  assertUniqueSorted(sorted, (item) => item.id, collection);
  return sorted;
}

/** Sorted, de-duplicated copy of a string array. */
export function sortedUnique<T extends string>(values: Iterable<T>): T[] {
  return [...new Set(values)].sort(compareStrings);
}

/** A copy of a record with its keys in canonical order (JSON key order is insertion order). */
export function sortRecordKeys<V>(record: Readonly<Record<string, V>>): Record<string, V> {
  const result: Record<string, V> = {};
  for (const key of Object.keys(record).sort(compareStrings)) result[key] = record[key] as V;
  return result;
}

function sortPartialRecordKeys<K extends string, V>(
  record: Partial<Record<K, V>>,
): Partial<Record<K, V>> {
  return sortRecordKeys(record as Record<string, V>) as Partial<Record<K, V>>;
}

export function compareLocations(a: SourceLocation, b: SourceLocation): number {
  return compareStrings(a.file, b.file) || a.line - b.line || a.column - b.column;
}

/** Total order on provenance: location, mechanism, resolution, specifier, typeOnly, confidence, rest. */
export function compareProvenance(a: Provenance, b: Provenance): number {
  return (
    compareLocations(a, b) ||
    compareStrings(a.mechanism, b.mechanism) ||
    compareStrings(a.resolution, b.resolution) ||
    compareStrings(a.specifier ?? "", b.specifier ?? "") ||
    Number(a.typeOnly ?? false) - Number(b.typeOnly ?? false) ||
    b.confidence - a.confidence ||
    compareStrings((a.via ?? []).join("\n"), (b.via ?? []).join("\n")) ||
    compareStrings(a.detector ?? "", b.detector ?? "") ||
    compareStrings(a.detail ?? "", b.detail ?? "")
  );
}

/** Edges are ordered by source, then target, then kind. */
export function compareEdges(a: EdgeEntity, b: EdgeEntity): number {
  return (
    compareStrings(a.source, b.source) ||
    compareStrings(a.target, b.target) ||
    compareStrings(a.kind, b.kind)
  );
}

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

function compareExports(a: ExportEntry, b: ExportEntry): number {
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

function comparePackageDependencies(a: PackageDependency, b: PackageDependency): number {
  return (
    compareStrings(a.name, b.name) ||
    (SCOPE_ORDER[a.scope] ?? 9) - (SCOPE_ORDER[b.scope] ?? 9) ||
    compareStrings(a.scope, b.scope) ||
    compareStrings(a.versionRange, b.versionRange) ||
    compareStrings(a.target, b.target)
  );
}

function compareEntryPoints(a: EntryPointEntry, b: EntryPointEntry): number {
  return (
    compareStrings(a.entity, b.entity) ||
    compareStrings(a.kind, b.kind) ||
    compareStrings(a.source, b.source) ||
    compareStrings(a.package ?? "", b.package ?? "") ||
    compareStrings(a.mappedFrom ?? "", b.mappedFrom ?? "")
  );
}

function canonicalAggregated(
  dependencies: readonly AggregatedDependency[],
): AggregatedDependency[] {
  const sorted = [...dependencies].sort((a, b) => compareStrings(a.entity, b.entity));
  assertUniqueSorted(sorted, (dependency) => dependency.entity, "aggregated dependencies");
  return sorted.map((dependency) => ({
    ...dependency,
    kindCounts: sortPartialRecordKeys(dependency.kindCounts),
    examples: [...dependency.examples],
  }));
}

function canonicalPackage(pkg: PackageEntity): PackageEntity {
  return {
    ...pkg,
    declaredDependencies: [...pkg.declaredDependencies].sort(comparePackageDependencies),
    dependencies: canonicalAggregated(pkg.dependencies),
    dependents: canonicalAggregated(pkg.dependents),
  };
}

function canonicalFile(file: FileEntity): FileEntity {
  const result: FileEntity = {
    ...file,
    exports: [...file.exports]
      .map((entry) =>
        entry.symbols === undefined ? entry : { ...entry, symbols: sortedUnique(entry.symbols) },
      )
      .sort(compareExports),
    tags: sortedUnique(file.tags),
  };
  if (file.roles !== undefined) {
    result.roles = [...file.roles].sort(
      (a, b) => compareStrings(a.role, b.role) || compareStrings(a.source, b.source),
    );
  }
  return result;
}

function canonicalSymbol(symbol: SymbolEntity): SymbolEntity {
  const result: SymbolEntity = { ...symbol };
  if (symbol.modifiers !== undefined) result.modifiers = sortedUnique(symbol.modifiers);
  if (symbol.tags !== undefined) result.tags = sortedUnique(symbol.tags);
  if (symbol.roles !== undefined) {
    result.roles = [...symbol.roles].sort(
      (a, b) => compareStrings(a.role, b.role) || compareStrings(a.source, b.source),
    );
  }
  return result;
}

function canonicalComponent(component: ComponentEntity): ComponentEntity {
  return {
    ...component,
    packages: sortedUnique(component.packages),
    children: sortedUnique(component.children),
    files: sortedUnique(component.files),
    modules: sortedUnique(component.modules),
    dependencies: canonicalAggregated(component.dependencies),
    dependents: canonicalAggregated(component.dependents),
  };
}

function canonicalModule(module: ModuleEntity): ModuleEntity {
  return {
    ...module,
    packages: sortedUnique(module.packages),
    files: sortedUnique(module.files),
    components: sortedUnique(module.components),
    entryPoints: sortedUnique(module.entryPoints),
    publicApi: sortedUnique(module.publicApi),
    dependencies: canonicalAggregated(module.dependencies),
    dependents: canonicalAggregated(module.dependents),
  };
}

function canonicalUnitMetrics(unit: UnitMetrics): UnitMetrics {
  return unit.extensions === undefined
    ? unit
    : { ...unit, extensions: sortRecordKeys(unit.extensions) };
}

function canonicalFactor(factor: EntropyFactor): EntropyFactor {
  if (factor.contributions === undefined) return factor;
  return {
    ...factor,
    contributions: [...factor.contributions].sort(
      (a, b) => b.share - a.share || compareStrings(a.entity, b.entity),
    ),
  };
}

function canonicalMetrics(metrics: MetricsReport): MetricsReport {
  return {
    ...metrics,
    projection: {
      ...metrics.projection,
      edgeKinds: sortedUnique(metrics.projection.edgeKinds),
      fileRoles: sortedUnique(metrics.projection.fileRoles),
    },
    definitions: [...metrics.definitions]
      .sort((a, b) => compareStrings(a.key, b.key))
      .map((definition) => ({ ...definition, levels: sortedUnique(definition.levels) })),
    system: { ...metrics.system, cycles: sortPartialRecordKeys(metrics.system.cycles) },
    entropy: { ...metrics.entropy, factors: metrics.entropy.factors.map(canonicalFactor) },
    units: sortUniqueByEntity(metrics.units).map(canonicalUnitMetrics),
  };
}

function sortUniqueByEntity(units: readonly UnitMetrics[]): UnitMetrics[] {
  const sorted = [...units].sort((a, b) => compareStrings(a.entity, b.entity));
  assertUniqueSorted(sorted, (unit) => unit.entity, "metrics.units");
  return sorted;
}

function canonicalAnomaly(anomaly: Anomaly): Anomaly {
  return {
    ...anomaly,
    subjects: sortedUnique(anomaly.subjects),
    edges: sortedUnique(anomaly.edges),
    locations: [...anomaly.locations].sort(compareLocations),
  };
}

function canonicalViolation(violation: RuleViolation): RuleViolation {
  const result: RuleViolation = {
    ...violation,
    edges: sortedUnique(violation.edges),
    locations: [...violation.locations].sort(compareLocations),
  };
  if (violation.subjects !== undefined) result.subjects = sortedUnique(violation.subjects);
  return result;
}

/**
 * Return a copy of the document with every array in canonical order and record keys sorted. Arrays whose
 * order is semantic (source order of symbols and imports, configuration order of rules, formula order of
 * score terms) are preserved.
 *
 * @throws {DuplicateIdError} when an entity array contains an identifier twice.
 */
export function canonicalizeDocument(document: ArchitectureDocument): ArchitectureDocument {
  const generator = { ...document.generator, adapters: sortById(document.generator.adapters) };
  if (document.generator.plugins !== undefined)
    generator.plugins = sortById(document.generator.plugins);
  return {
    ...document,
    generator,
    repository: {
      ...document.repository,
      languages: [...document.repository.languages].sort(
        (a, b) => b.lines - a.lines || compareStrings(a.language, b.language),
      ),
    },
    directories: sortUniqueById("directories", document.directories).map((directory) => ({
      ...directory,
      directories: sortedUnique(directory.directories),
      files: sortedUnique(directory.files),
    })),
    packages: sortUniqueById("packages", document.packages).map(canonicalPackage),
    files: sortUniqueById("files", document.files).map(canonicalFile),
    symbols: sortUniqueById("symbols", document.symbols).map(canonicalSymbol),
    externals: sortUniqueById("externals", document.externals),
    edges: sortUniqueById("edges", document.edges)
      .sort(compareEdges)
      .map((edge) => ({ ...edge, provenance: [...edge.provenance].sort(compareProvenance) })),
    entryPoints: [...document.entryPoints].sort(compareEntryPoints),
    components: sortUniqueById("components", document.components).map(canonicalComponent),
    modules: sortUniqueById("modules", document.modules).map(canonicalModule),
    layers: sortUniqueById("layers", document.layers)
      .sort((a, b) => a.rank - b.rank || compareStrings(a.id, b.id))
      .map((layer) => ({
        ...layer,
        files: sortedUnique(layer.files),
        dependencies: canonicalAggregated(layer.dependencies),
        dependents: canonicalAggregated(layer.dependents),
      })),
    endpoints: sortUniqueById("endpoints", document.endpoints),
    metrics: canonicalMetrics(document.metrics),
    anomalies: sortUniqueById("anomalies", document.anomalies).map(canonicalAnomaly),
    violations: sortUniqueById("violations", document.violations).map(canonicalViolation),
    diagnostics: [...document.diagnostics].sort(compareDiagnostics),
  };
}

export interface SerializeOptions {
  /** Indent with two spaces (default true). */
  pretty?: boolean;
  /** Include the non-deterministic `run` section (default false). */
  includeRun?: boolean;
}

function rejectNonFinite(_key: string, value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError(`Cannot serialize non-finite number ${value}`);
  }
  return value;
}

function withoutRun(document: object, includeRun: boolean): object {
  if (includeRun || !("run" in document)) return document;
  const { run: _run, ...rest } = document as { run?: unknown };
  return rest;
}

/**
 * Serialize a document or report to JSON text terminated by a newline.
 *
 * @throws {RangeError} for non-finite numbers, or when the text exceeds the platform's maximum string length
 *   (use {@link serializeDocumentChunks} for very large documents).
 */
export function serializeDocument(document: object, options: SerializeOptions = {}): string {
  const { pretty = true, includeRun = false } = options;
  const value = withoutRun(document, includeRun);
  return `${JSON.stringify(value, rejectNonFinite, pretty ? 2 : undefined)}\n`;
}

/**
 * Serialize a document as a sequence of text chunks whose concatenation equals
 * {@link serializeDocument}'s output. Top-level arrays are emitted one element at a time, so documents larger
 * than the maximum string length can be streamed to a file or socket.
 */
export function* serializeDocumentChunks(
  document: object,
  options: SerializeOptions = {},
): Generator<string, void, undefined> {
  const { pretty = true, includeRun = false } = options;
  const value = withoutRun(document, includeRun) as Record<string, unknown>;
  const indent = pretty ? "  " : "";
  const newline = pretty ? "\n" : "";
  const keys = Object.keys(value).filter((key) => value[key] !== undefined);
  if (keys.length === 0) {
    yield "{}\n";
    return;
  }
  const stringify = (item: unknown, depth: number): string => {
    const text = JSON.stringify(item, rejectNonFinite, pretty ? 2 : undefined);
    return pretty ? text.replaceAll("\n", `\n${indent.repeat(depth)}`) : text;
  };
  yield `{${newline}`;
  for (const [k, key] of keys.entries()) {
    const item = value[key];
    const separator = k === keys.length - 1 ? "" : ",";
    const prefix = `${indent}${JSON.stringify(key)}:${pretty ? " " : ""}`;
    if (Array.isArray(item) && item.length > 0) {
      yield `${prefix}[${newline}`;
      for (const [i, element] of (item as unknown[]).entries()) {
        const elementSeparator = i === item.length - 1 ? "" : ",";
        yield `${indent.repeat(2)}${stringify(element ?? null, 2)}${elementSeparator}${newline}`;
      }
      yield `${indent}]${separator}${newline}`;
    } else {
      yield `${prefix}${stringify(item, 1)}${separator}${newline}`;
    }
  }
  yield `}\n`;
}
