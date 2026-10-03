/**
 * Extraction of a parsed file into the language-neutral `FileExtraction`.
 *
 * Passes: symbol collection and naming → reference walk (references, imports in code, facts) → exports →
 * symbol assembly → module format and globals. Every pass reads only the file's syntax tree and the
 * binder's scopes, so the result is a pure function of path, content, dialect and options.
 *
 * Without scopes (the file is nested beyond the limit for binding, see `nesting.ts`; or, as a last resort,
 * TypeScript's binder failed or name resolution exhausted the call stack), the file is extracted all the
 * same, but names are not resolved: imports, symbols and exports are complete, and so are references through
 * `this` and `require()` chains; references through names are missing, and every name is taken for a global
 * (`process`, `require`, `exports`). A diagnostic in `syntaxErrors` says so, which makes the file's analysis
 * `partial`.
 */
import type { ExtractedImport, ExtractionDiagnostic, FileExtraction } from "@katedrala/plugin-api";
import type ts from "typescript";
import type { ResolvedTypeScriptAdapterOptions } from "../options.js";
import { ArgumentSummarizer } from "./arguments.js";
import { collectDeclarations } from "./declarations.js";
import { collectExports } from "./exports.js";
import { globalsOf, moduleFormatOf } from "./module-format.js";
import { NESTED_TOO_DEEPLY_TO_BIND, isStackOverflow } from "./nesting.js";
import type { ParsedTypeScriptFile } from "./parse.js";
import { Resolver } from "./resolver.js";
import { ScopeLookup } from "./scope.js";
import { assembleSymbols } from "./symbols.js";
import { positionAt } from "./text.js";
import { requireTestOf } from "./variable-imports.js";
import { walkFile, type PositionedImport } from "./walker.js";

/** `/// <reference path="..." />` and `/// <reference types="..." />` directives. */
function tripleSlashImports(file: ts.SourceFile): PositionedImport[] {
  const references = [...file.referencedFiles, ...file.typeReferenceDirectives];
  return references.map((reference) => {
    const directive = file.text.lastIndexOf("///", reference.pos);
    const offset = directive === -1 ? reference.pos : directive;
    const position = positionAt(file, offset);
    const entry: ExtractedImport = {
      specifier: reference.fileName,
      literal: true,
      kind: "include",
      mechanism: "triple-slash-reference",
      typeOnly: true,
      line: position.line,
      column: position.column,
      bindings: [],
    };
    return { offset, entry };
  });
}

function bySourceOrder<T extends { readonly line: number; readonly column: number }>(
  items: T[],
): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.line - b.item.line || a.item.column - b.item.column || a.index - b.index)
    .map(({ item }) => item);
}

/** A file-level note that names were not resolved (reported with the syntax errors). */
function unresolvedNamesDiagnostic(cause: string): ExtractionDiagnostic {
  return {
    message: `Incomplete extraction: ${cause}, so names were not resolved and references to imports and declarations are missing.`,
    line: 1,
    column: 1,
  };
}

/** One extraction of a parsed file, with scopes or without them. */
function extractWithScopes(
  parsed: ParsedTypeScriptFile,
  options: ResolvedTypeScriptAdapterOptions,
  bound: boolean,
  notes: readonly ExtractionDiagnostic[],
): FileExtraction {
  const file = parsed.sourceFile;
  const javascript = parsed.language === "javascript";
  const scopes = new ScopeLookup(bound);
  const isGlobal = (identifier: ts.Identifier): boolean =>
    scopes.lookup(identifier.escapedText, identifier, "value").length === 0;
  const declarations = collectDeclarations(file, { isGlobal, isRequire: requireTestOf(scopes) });
  const resolver = new Resolver(file, declarations, { bound, javascript, scopes });
  const walk = walkFile(file, resolver, declarations, options, javascript);
  const imports = [...tripleSlashImports(file), ...walk.imports]
    .map((positioned, index) => ({ positioned, index }))
    .sort((a, b) => a.positioned.offset - b.positioned.offset || a.index - b.index)
    .map(({ positioned }) => positioned.entry);
  const exports = collectExports(file, declarations, resolver);
  const symbols = assembleSymbols(
    file,
    declarations,
    resolver,
    new ArgumentSummarizer(file, resolver),
    javascript,
  );
  const moduleFormat = moduleFormatOf(file, parsed.suffix, walk.usage);
  const globals = globalsOf(declarations, moduleFormat);
  const extraction: FileExtraction = {
    moduleFormat,
    syntaxErrors: [...notes, ...parsed.syntaxErrors],
    symbols,
    imports,
    exports,
    references: bySourceOrder(walk.references),
    facts: bySourceOrder(walk.facts),
  };
  if (globals.length > 0) extraction.globals = globals;
  return extraction;
}

/**
 * Extract the language-neutral facts of a parsed file. A file that was not bound, or whose name resolution
 * exhausts the call stack, is extracted without scopes and marked incomplete (see the module documentation);
 * other errors propagate.
 */
export function extractTypeScriptFile(
  parsed: ParsedTypeScriptFile,
  options: ResolvedTypeScriptAdapterOptions,
): FileExtraction {
  if (!parsed.bound) {
    const reason = parsed.bindingFailure ?? "unknown error";
    const cause =
      reason === NESTED_TOO_DEEPLY_TO_BIND
        ? reason
        : `TypeScript could not bind this file (${reason})`;
    return extractWithScopes(parsed, options, false, [unresolvedNamesDiagnostic(cause)]);
  }
  try {
    return extractWithScopes(parsed, options, true, []);
  } catch (error) {
    if (!isStackOverflow(error)) throw error;
    const cause = "resolving names exceeded the call stack (the file is nested too deeply)";
    return extractWithScopes(parsed, options, false, [unresolvedNamesDiagnostic(cause)]);
  }
}
