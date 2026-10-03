/**
 * File and symbol records: per-file indexes over an extraction (symbols by local name, import bindings,
 * export tables, heritage references), built before any cross-file work.
 */
import { InvalidIdentifierError, fileId, symbolCategoryOf, symbolId } from "@katedrala/ir";
import type { PackageId, SymbolId } from "@katedrala/ir";
import type {
  AdapterProject,
  ExtractedExport,
  ExtractedReference,
  ExtractedSymbol,
} from "@katedrala/plugin-api";
import type { DiagnosticSink } from "./diagnostics.js";
import { errorMessage } from "./diagnostics.js";
import type {
  ExportTable,
  FileRecord,
  ImportBindingRecord,
  ModuleTarget,
  SymbolRecord,
} from "./model.js";
import type { LinkFile } from "./types.js";

/** The two parts of a local name: the escaped qualified name and the optional disambiguator. */
export interface LocalNameParts {
  qualifiedName: string;
  disambiguator?: string;
}

/**
 * Split a local name (`<qualified name>[~<disambiguator>]`) at its first `~`; escaped qualified names never
 * contain `~`.
 */
export function splitLocalName(localName: string): LocalNameParts {
  const tilde = localName.indexOf("~");
  if (tilde === -1) return { qualifiedName: localName };
  return { qualifiedName: localName.slice(0, tilde), disambiguator: localName.slice(tilde + 1) };
}

function isStaticSymbol(symbol: ExtractedSymbol, disambiguator: string | undefined): boolean {
  if (symbol.modifiers?.includes("static") === true) return true;
  return disambiguator?.split("-").includes("static") ?? false;
}

const HERITAGE_PRIMARY: ReadonlySet<string> = new Set(["extends", "embed"]);
const HERITAGE_SECONDARY: ReadonlySet<string> = new Set(["implements", "derive"]);

function heritageOf(references: readonly ExtractedReference[]): Map<string, ExtractedReference[]> {
  const primary = new Map<string, ExtractedReference[]>();
  const secondary = new Map<string, ExtractedReference[]>();
  for (const reference of references) {
    if (reference.from === undefined) continue;
    const bucket = HERITAGE_PRIMARY.has(reference.kind)
      ? primary
      : HERITAGE_SECONDARY.has(reference.kind)
        ? secondary
        : undefined;
    if (bucket === undefined) continue;
    const list = bucket.get(reference.from);
    if (list === undefined) bucket.set(reference.from, [reference]);
    else list.push(reference);
  }
  const heritage = new Map<string, ExtractedReference[]>();
  for (const [from, list] of primary) heritage.set(from, [...list]);
  for (const [from, list] of secondary) {
    const existing = heritage.get(from);
    if (existing === undefined) heritage.set(from, [...list]);
    else existing.push(...list);
  }
  return heritage;
}

function exportTableOf(exports: readonly ExtractedExport[]): ExportTable {
  const local = new Map<string, ExtractedExport[]>();
  const indirect = new Map<string, ExtractedExport & { from: string }>();
  const stars: (ExtractedExport & { from: string })[] = [];
  for (const entry of exports) {
    const from = entry.from;
    if (from === undefined) {
      const list = local.get(entry.name);
      if (list === undefined) local.set(entry.name, [entry]);
      else list.push(entry);
    } else if (entry.name === "*") {
      stars.push({ ...entry, from });
    } else if (!indirect.has(entry.name)) {
      indirect.set(entry.name, { ...entry, from });
    }
  }
  return { local, indirect, stars };
}

/** Inputs of {@link createFileRecord} besides the file itself. */
export interface FileRecordContext {
  readonly project: AdapterProject | undefined;
  readonly packageId: PackageId | undefined;
  readonly diagnostics: DiagnosticSink;
}

/**
 * Index one file's extraction. Symbols whose local names do not form valid identifiers are dropped with a
 * `plugin-error` diagnostic; repeated local names (already merged declarations) keep their first occurrence.
 */
export function createFileRecord(input: LinkFile, context: FileRecordContext): FileRecord {
  const extraction = input.extraction;
  const symbols: SymbolRecord[] = [];
  const symbolsByLocalName = new Map<string, SymbolRecord>();
  const bindings = new Map<string, ImportBindingRecord>();
  const moduleTargets: ModuleTarget[] = [];
  const record: FileRecord = {
    input,
    path: input.path,
    id: fileId(input.path),
    extraction,
    adapterId: input.adapter?.id,
    project: context.project,
    packageId: context.packageId,
    symbols,
    symbolsByLocalName,
    bindings,
    moduleTargets,
    exportTable: exportTableOf(extraction?.exports ?? []),
    heritage: heritageOf(extraction?.references ?? []),
  };
  if (extraction === undefined) return record;

  for (const extracted of extraction.symbols) {
    if (symbolsByLocalName.has(extracted.localName)) continue;
    const parts = splitLocalName(extracted.localName);
    let id: SymbolId;
    try {
      id = symbolId(input.path, parts.qualifiedName, parts.disambiguator);
    } catch (error) {
      if (!(error instanceof InvalidIdentifierError)) throw error;
      context.diagnostics.add({
        code: "plugin-error",
        severity: "warning",
        message: `Symbol ${JSON.stringify(extracted.localName)} was ignored: ${errorMessage(error)}`,
        file: record.id,
        line: extracted.range.start.line,
        column: extracted.range.start.column,
      });
      continue;
    }
    const symbol: SymbolRecord = {
      id,
      localName: extracted.localName,
      qualifiedName: parts.qualifiedName,
      name: extracted.name,
      kind: extracted.kind,
      category: extracted.category ?? symbolCategoryOf(extracted.kind) ?? "value",
      isStatic: isStaticSymbol(extracted, parts.disambiguator),
      file: record,
      extracted,
      parent: undefined,
      owner: undefined,
      partOf: undefined,
    };
    symbols.push(symbol);
    symbolsByLocalName.set(extracted.localName, symbol);
  }
  for (const symbol of symbols) {
    const parentName = symbol.extracted.parent;
    if (parentName === undefined) continue;
    const parent = symbolsByLocalName.get(parentName);
    if (parent !== undefined && parent !== symbol) symbol.parent = parent;
  }
  extraction.imports.forEach((extracted, importIndex) => {
    for (const binding of extracted.bindings) {
      if (binding.local === undefined || bindings.has(binding.local)) continue;
      bindings.set(binding.local, { importIndex, binding });
    }
  });
  return record;
}
