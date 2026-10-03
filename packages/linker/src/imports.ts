/**
 * The import stage: resolves every import entry of every file into an `ImportEntry`, `imports` /
 * `re-exports` observations, `unresolved-import` diagnostics and the usage of external packages.
 */
import { roundMetric } from "@katedrala/ir";
import type {
  EdgeKind,
  ExternalEntity,
  ImportEntry,
  ImportResolution,
  NodeId,
  Provenance,
  ResolutionMethod,
} from "@katedrala/ir";
import type { ExtractedImport } from "@katedrala/plugin-api";
import type { DiagnosticSink } from "./diagnostics.js";
import type { FileRecord, ModuleTarget, Observation } from "./model.js";
import type { ModuleResolver } from "./modules.js";

/** One import of a file that resolved to an external package. */
export interface ExternalUsage {
  readonly file: FileRecord;
  readonly external: ExternalEntity;
  /** Whether the import is type-only by its syntax (`ExtractedImport.typeOnly`). */
  readonly typeOnly: boolean;
}

/** Result of {@link resolveImports}. */
export interface ImportStageResult {
  /** Import entries per file, in source order. */
  readonly entries: ReadonlyMap<FileRecord, ImportEntry[]>;
  readonly observations: readonly Observation[];
  /**
   * Number of import entries that could not be resolved (status `unresolved`). Imports of files excluded
   * from the analysis resolved (status `excluded`) and are not counted.
   */
  readonly unresolved: number;
  readonly externalUsage: readonly ExternalUsage[];
}

/** The `ImportEntry.resolution` of a module target. */
export function importResolutionOf(target: ModuleTarget): ImportResolution {
  switch (target.status) {
    case "resolved":
      return {
        status: "resolved",
        targets: target.files.map((file) => file.id),
        method: target.method,
        ...(target.unit === undefined ? {} : { unit: target.unit }),
      };
    case "external":
      return { status: "external", target: target.external.id, method: target.method };
    case "builtin":
      return { status: "builtin", target: target.external.id };
    case "excluded":
      // By path: the files are not part of the document, so they have no identifiers.
      return {
        status: "excluded",
        paths: [...target.paths],
        method: target.method,
        ...(target.unit === undefined ? {} : { unit: target.unit }),
      };
    case "unresolved":
      return target.method === undefined
        ? { status: "unresolved", reason: target.reason }
        : { status: "unresolved", reason: target.reason, method: target.method };
    case "non-literal":
      return { status: "non-literal" };
  }
}

interface EdgeTarget {
  readonly node: NodeId;
  readonly method: ResolutionMethod;
  readonly confidence: number;
}

function edgeTargets(target: ModuleTarget): EdgeTarget[] {
  switch (target.status) {
    case "resolved":
      return target.files.map((file) => ({
        node: file.id,
        method: target.method,
        confidence: target.confidence,
      }));
    case "external":
      return [{ node: target.external.id, method: target.method, confidence: target.confidence }];
    case "builtin":
      return [{ node: target.external.id, method: "builtin-module", confidence: 1 }];
    case "excluded":
    case "unresolved":
    case "non-literal":
      return [];
  }
}

function importEntry(
  file: FileRecord,
  extracted: ExtractedImport,
  target: ModuleTarget,
  includeSymbols: boolean,
): ImportEntry {
  const from =
    includeSymbols && extracted.from !== undefined
      ? file.symbolsByLocalName.get(extracted.from)?.id
      : undefined;
  return {
    specifier: extracted.specifier,
    kind: extracted.kind,
    mechanism: extracted.mechanism,
    typeOnly: extracted.typeOnly,
    line: extracted.line,
    column: extracted.column,
    ...(from === undefined ? {} : { from }),
    ...(extracted.wildcard === true ? { wildcard: true } : {}),
    ...(extracted.global === true ? { global: true } : {}),
    ...(extracted.optional === true ? { optional: true } : {}),
    resolution: importResolutionOf(target),
  };
}

/**
 * Resolve the imports of every file (in the given order) and record each file's module targets in
 * `FileRecord.moduleTargets`. Unresolved imports get an `unresolved-import` warning. Imports of files
 * excluded from the analysis get no diagnostic: their entry (status `excluded`, with the files' paths)
 * already says what happened, and the exclusion is deliberate, not a failure.
 *
 * @param includeSymbols - whether `ImportEntry.from` may reference symbols (false when symbols are omitted).
 */
export function resolveImports(
  files: readonly FileRecord[],
  resolver: ModuleResolver,
  diagnostics: DiagnosticSink,
  includeSymbols: boolean,
): ImportStageResult {
  const entries = new Map<FileRecord, ImportEntry[]>();
  const observations: Observation[] = [];
  const externalUsage: ExternalUsage[] = [];
  let unresolved = 0;
  for (const file of files) {
    const list: ImportEntry[] = [];
    entries.set(file, list);
    for (const extracted of file.extraction?.imports ?? []) {
      const target: ModuleTarget = extracted.literal
        ? resolver.resolve(file, {
            specifier: extracted.specifier,
            kind: extracted.kind,
            mechanism: extracted.mechanism,
          })
        : { status: "non-literal" };
      file.moduleTargets.push(target);
      list.push(importEntry(file, extracted, target, includeSymbols));
      if (target.status === "unresolved") {
        unresolved++;
        diagnostics.add({
          code: "unresolved-import",
          severity: "warning",
          message: `Cannot resolve "${extracted.specifier}": ${target.reason}`,
          file: file.id,
          line: extracted.line,
          column: extracted.column,
        });
      }
      if (target.status === "external") {
        externalUsage.push({ file, external: target.external, typeOnly: extracted.typeOnly });
      }
      if (extracted.kind === "module-declaration") continue;
      const kind: EdgeKind = extracted.kind === "re-export" ? "re-exports" : "imports";
      for (const edge of edgeTargets(target)) {
        if (edge.node === file.id) continue;
        const provenance: Provenance = {
          file: file.id,
          line: extracted.line,
          column: extracted.column,
          mechanism: extracted.mechanism,
          resolution: edge.method,
          confidence: roundMetric(edge.confidence),
          specifier: extracted.specifier,
          ...(extracted.typeOnly ? { typeOnly: true } : {}),
        };
        observations.push({ kind, source: file.id, target: edge.node, provenance });
      }
    }
  }
  return { entries, observations, unresolved, externalUsage };
}
