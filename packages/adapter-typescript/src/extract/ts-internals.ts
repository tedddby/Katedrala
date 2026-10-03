/**
 * Typed access to TypeScript compiler internals the adapter relies on.
 *
 * TypeScript 6.0 sets these properties at runtime but does not declare them in its public typings. They are
 * isolated here, each behind a small accessor, so that a TypeScript upgrade only needs to revisit this file:
 * - `ts.bindSourceFile(file, options)`: the binder, which creates per-scope symbol tables;
 * - `node.locals`: the symbol table of a scope container (source file, function, block, module, ...);
 * - `node.symbol`: the symbol the binder attached to a declaration;
 * - `node.jsDoc`: JSDoc comments attached to a node (JavaScript files parsed for type information);
 * - `sourceFile.parseDiagnostics`: syntax errors reported by the parser;
 * - the parser and the binder clear their per-file state only when they complete (see
 *   {@link resetParserState}).
 *
 * TypeChecker query methods are never used: without library files the checker fails during call resolution.
 */
import ts from "typescript";

const { createProgram } = ts;

/** A binder symbol table: escaped name → symbol. */
export type SymbolTable = ReadonlyMap<ts.__String, ts.Symbol>;

interface BoundNode {
  readonly locals?: SymbolTable;
  readonly symbol?: ts.Symbol;
  readonly jsDoc?: readonly ts.JSDoc[];
}

interface ParsedSourceFile {
  readonly parseDiagnostics?: readonly ts.DiagnosticWithLocation[];
}

type BindSourceFile = (file: ts.SourceFile, options: ts.CompilerOptions) => void;

/** Options for binding a single file in isolation. */
const BIND_OPTIONS: ts.CompilerOptions = Object.freeze({
  target: ts.ScriptTarget.Latest,
  allowJs: true,
  noEmit: true,
  noLib: true,
  noResolve: true,
  types: [],
});

/** The symbol table of a scope container, when the file was bound. */
export function localsOf(node: ts.Node): SymbolTable | undefined {
  return (node as ts.Node & BoundNode).locals;
}

/** The symbol the binder attached to a declaration. */
export function symbolOf(node: ts.Node): ts.Symbol | undefined {
  return (node as ts.Node & BoundNode).symbol;
}

/** JSDoc comments attached to a node (only parsed in JavaScript files). */
export function jsDocOf(node: ts.Node): readonly ts.JSDoc[] {
  return (node as ts.Node & BoundNode).jsDoc ?? [];
}

/** Syntax errors reported by the parser for a file. */
export function parseDiagnosticsOf(file: ts.SourceFile): readonly ts.DiagnosticWithLocation[] {
  return (file as ts.SourceFile & ParsedSourceFile).parseDiagnostics ?? [];
}

/** `ts.bindSourceFile` when the running TypeScript exposes it (verified for TypeScript 6.0). */
export function internalBinder(): BindSourceFile | undefined {
  const candidate: unknown = Reflect.get(ts, "bindSourceFile");
  return typeof candidate === "function" ? (candidate as BindSourceFile) : undefined;
}

/**
 * Bind a file through a single-file program: creating the type checker binds every file as a side effect.
 * The compiler host serves only this file (no library files, no module resolution).
 */
export function bindWithProgram(file: ts.SourceFile): void {
  const host: ts.CompilerHost = {
    getSourceFile: (fileName) => (fileName === file.fileName ? file : undefined),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "",
    getCanonicalFileName: (fileName) => fileName,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (fileName) => fileName === file.fileName,
    readFile: () => undefined,
    directoryExists: () => true,
    getDirectories: () => [],
  };
  const program = createProgram({ rootNames: [file.fileName], options: BIND_OPTIONS, host });
  program.getTypeChecker();
}

/**
 * Clear what TypeScript's parser keeps between files after a parse that threw (e.g. by exhausting the stack).
 * The parser clears some of its state only when a parse completes, notably its cache of the positions that
 * do not start a parenthesized arrow function: left behind, it would change how the next file in the thread
 * is parsed. Parsing an empty file completes and clears it.
 */
export function resetParserState(): void {
  ts.createSourceFile("reset.ts", "", ts.ScriptTarget.Latest);
}

/**
 * Clear what TypeScript's binder keeps between files after binding threw: like the parser, it resets its
 * state (and binds the JSDoc type aliases it deferred) only when binding completes. Binding an empty file
 * completes and clears it.
 */
function resetBinderState(binder: BindSourceFile | undefined): void {
  try {
    const empty = ts.createSourceFile("reset.ts", "", ts.ScriptTarget.Latest, true);
    if (binder !== undefined) binder(empty, BIND_OPTIONS);
    else bindWithProgram(empty);
  } catch {
    // Nothing more can be done; the file that failed is extracted without scopes either way.
  }
}

/** How a file is bound; `program` forces the fallback (used by tests). */
export type BindingStrategy = "auto" | "program";

/** The outcome of {@link bindSourceFile}: whether scopes are available, else why not. */
export type BindingOutcome =
  { readonly bound: true } | { readonly bound: false; readonly reason: string };

/**
 * Bind a file for scope analysis: with `ts.bindSourceFile` when available, otherwise through a single-file
 * program. Says whether the file's scopes are available afterwards.
 */
export function bindSourceFile(
  file: ts.SourceFile,
  strategy: BindingStrategy = "auto",
): BindingOutcome {
  const binder = strategy === "auto" ? internalBinder() : undefined;
  try {
    if (binder !== undefined) binder(file, BIND_OPTIONS);
    else bindWithProgram(file);
  } catch (error) {
    // The binder accepts any tree the parser produces, but recurses along it; files nested deeply enough to
    // exhaust the stack are not bound at all (see `nesting.ts`), so this is a last resort. Extraction then
    // continues without scope information (see `ParsedTypeScriptFile.bound`) and reports the reason.
    resetBinderState(binder);
    return { bound: false, reason: error instanceof Error ? error.message : String(error) };
  }
  return localsOf(file) === undefined
    ? { bound: false, reason: "the binder created no scopes" }
    : { bound: true };
}
