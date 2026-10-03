/**
 * Symbols: partial-type grouping, the global-scope table and conversion of symbol records into
 * `SymbolEntity` values.
 */
import { sortedUnique } from "@katedrala/ir";
import type { DecoratorEntry, RoleEntry, SymbolEntity } from "@katedrala/ir";
import type { FileRecord, SymbolRecord } from "./model.js";
import { compareById } from "./order.js";

/**
 * Link partial declarations of one type split across files (`ExtractedSymbol.partial`, e.g. C# `partial
 * class`): declarations with the same owning package, file namespaces, qualified name and kind form one
 * type whose canonical declaration is the one with the smallest id; the others get `partOf`.
 */
export function assignPartials(files: readonly FileRecord[]): void {
  const groups = new Map<string, SymbolRecord[]>();
  for (const file of files) {
    const namespaces = (file.extraction?.namespaces ?? []).join("\u0001");
    for (const symbol of file.symbols) {
      if (symbol.extracted.partial !== true) continue;
      const key = [file.packageId ?? "", namespaces, symbol.qualifiedName, symbol.kind].join(
        "\u0000",
      );
      const list = groups.get(key);
      if (list === undefined) groups.set(key, [symbol]);
      else list.push(symbol);
    }
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const [canonical, ...others] = [...list].sort(compareById);
    if (canonical === undefined) continue;
    for (const symbol of others) symbol.partOf = canonical;
  }
}

/** Symbols declared in the global scope (`FileExtraction.globals`) by local name, each list sorted by id. */
export function globalScope(files: readonly FileRecord[]): Map<string, SymbolRecord[]> {
  const table = new Map<string, SymbolRecord[]>();
  for (const file of files) {
    for (const localName of file.extraction?.globals ?? []) {
      const symbol = file.symbolsByLocalName.get(localName);
      if (symbol === undefined) continue;
      const list = table.get(localName);
      if (list === undefined) table.set(localName, [symbol]);
      else if (!list.includes(symbol)) list.push(symbol);
    }
  }
  for (const list of table.values()) list.sort(compareById);
  return table;
}

function decoratorsOf(symbol: SymbolRecord): DecoratorEntry[] {
  // Parameter decorators are reported on the function symbol by adapters, but a DecoratorEntry cannot say
  // which parameter they decorate; listing them would misattribute them to the function itself.
  return (symbol.extracted.decorators ?? [])
    .filter((decorator) => decorator.parameterIndex === undefined)
    .map((decorator) => ({
      name: decorator.name,
      invoked: decorator.invoked,
      arguments: [...decorator.text],
    }));
}

function rolesOf(symbol: SymbolRecord): RoleEntry[] {
  const adapter = symbol.file.adapterId ?? "adapter";
  return sortedUnique(symbol.extracted.roles ?? []).map((role) => ({
    role,
    confidence: 1,
    source: adapter,
    evidence: [
      {
        signal: "declaration-syntax",
        description: `The ${adapter} adapter recognized the role from the declaration's syntax.`,
      },
    ],
  }));
}

/**
 * The `SymbolEntity` of a symbol record. Empty optional arrays are omitted; `declarations` is listed only for
 * merged declarations (more than one).
 */
export function symbolEntity(symbol: SymbolRecord, exported: boolean): SymbolEntity {
  const extracted = symbol.extracted;
  const modifiers = sortedUnique(extracted.modifiers ?? []);
  const decorators = decoratorsOf(symbol);
  const roles = rolesOf(symbol);
  const owner = symbol.owner;
  return {
    id: symbol.id,
    name: extracted.name,
    // From the local name, so that the qualified name always agrees with the identifier.
    qualifiedName: symbol.qualifiedName,
    kind: extracted.kind,
    category: symbol.category,
    file: symbol.file.id,
    ...(symbol.parent === undefined ? {} : { parent: symbol.parent.id }),
    ...(owner === undefined ? {} : { owner: owner.id }),
    ...(symbol.partOf === undefined ? {} : { partOf: symbol.partOf.id }),
    range: extracted.range,
    ...(extracted.declarations === undefined || extracted.declarations.length < 2
      ? {}
      : {
          declarations: extracted.declarations.map((declaration) =>
            declaration.signature === undefined
              ? { range: declaration.range }
              : { range: declaration.range, signature: declaration.signature },
          ),
        }),
    exported,
    ...(extracted.visibility === undefined ? {} : { visibility: extracted.visibility }),
    ...(extracted.abstract === undefined ? {} : { abstract: extracted.abstract }),
    ...(modifiers.length === 0 ? {} : { modifiers }),
    ...(decorators.length === 0 ? {} : { decorators }),
    ...(extracted.signature === undefined ? {} : { signature: extracted.signature }),
    ...(extracted.role === undefined ? {} : { role: extracted.role }),
    ...(roles.length === 0 ? {} : { roles }),
  };
}

/**
 * Whether each symbol of a file is exported (visible outside its module unit):
 * - never when the adapter says it is not (`exported: false`);
 * - when a local export of the file targets it;
 * - for a member of a namespace (or module) declaration, when the namespace is exported: the adapter's
 *   `exported: true` there means exported from the namespace (TypeScript's inner `export`, Rust's `pub`),
 *   which makes it visible outside only through an exported namespace;
 * - otherwise when the adapter says so.
 *
 * @param locallyExported - symbols of the file targeted by its own exports.
 */
export function exportedFlags(
  file: FileRecord,
  locallyExported: ReadonlySet<SymbolRecord>,
): Map<SymbolRecord, boolean> {
  const flags = new Map<SymbolRecord, boolean>();
  const visit = (symbol: SymbolRecord, depth: number): boolean => {
    const known = flags.get(symbol);
    if (known !== undefined) return known;
    const stated = symbol.extracted.exported;
    const parent = symbol.parent;
    let exported: boolean;
    if (stated === false) exported = false;
    else if (locallyExported.has(symbol)) exported = true;
    else if (parent !== undefined && parent.category === "namespace") {
      exported = depth < file.symbols.length && visit(parent, depth + 1);
    } else exported = stated ?? false;
    flags.set(symbol, exported);
    return exported;
  };
  for (const symbol of file.symbols) visit(symbol, 0);
  return flags;
}
