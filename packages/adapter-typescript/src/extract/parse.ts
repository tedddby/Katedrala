/**
 * Parsing with the TypeScript 6 compiler API, followed by binding (scope analysis), within the nesting limits
 * that make both independent of the thread they run in (see `nesting.ts`).
 */
import type { ExtractionDiagnostic, ParseInput } from "@katedrala/plugin-api";
import ts from "typescript";
import {
  dialectSuffixOf,
  isTypeScriptDialect,
  languageOfDialect,
  type TypeScriptDialect,
  type TypeScriptLanguageId,
} from "../languages.js";
import {
  MAX_BINDING_NESTING,
  MAX_PARSING_NESTING,
  NESTED_TOO_DEEPLY_TO_BIND,
  NESTED_TOO_DEEPLY_TO_PARSE,
  isStackOverflow,
  measureNesting,
} from "./nesting.js";
import {
  bindSourceFile,
  parseDiagnosticsOf,
  resetParserState,
  type BindingStrategy,
} from "./ts-internals.js";
import { positionAt } from "./text.js";

const { createSourceFile, flattenDiagnosticMessageText } = ts;

/** A parsed and bound file: the adapter's syntax tree type (never crosses the adapter boundary). */
export interface ParsedTypeScriptFile {
  readonly path: string;
  readonly language: TypeScriptLanguageId;
  readonly dialect: TypeScriptDialect;
  /** Lower-cased suffix that determined the dialect (e.g. `.tsx`, `.d.mts`). */
  readonly suffix: string;
  readonly sourceFile: ts.SourceFile;
  readonly syntaxErrors: readonly ExtractionDiagnostic[];
  /** Whether binding succeeded; without it, references to local names cannot be told from globals. */
  readonly bound: boolean;
  /**
   * Why the file was not bound, when it was not: {@link NESTED_TOO_DEEPLY_TO_BIND}, or the binder's error.
   */
  readonly bindingFailure?: string;
}

const DEFAULT_SUFFIX: Readonly<Record<TypeScriptDialect, string>> = {
  ts: ".ts",
  tsx: ".tsx",
  mts: ".mts",
  cts: ".cts",
  dts: ".d.ts",
  js: ".js",
  jsx: ".jsx",
  mjs: ".mjs",
  cjs: ".cjs",
};

function scriptKindOf(dialect: TypeScriptDialect): ts.ScriptKind {
  switch (dialect) {
    case "tsx":
      return ts.ScriptKind.TSX;
    case "ts":
    case "mts":
    case "cts":
    case "dts":
      return ts.ScriptKind.TS;
    case "jsx":
      return ts.ScriptKind.JSX;
    case "js":
    case "mjs":
    case "cjs":
      // TypeScript parses JSX in plain JavaScript files as well.
      return ts.ScriptKind.JS;
  }
}

/**
 * The file name given to TypeScript: the path with its dialect suffix in lower case, so that TypeScript
 * recognizes declaration files (`Types.D.TS`) regardless of the path's case.
 */
function compilerFileName(path: string, suffix: string): string {
  const match = dialectSuffixOf(path);
  const stem = match === undefined ? path : path.slice(0, path.length - match.suffix.length);
  return `${stem}${suffix}`;
}

/** Options of {@link parseTypeScriptFile} (for tests). */
export interface ParseOptions {
  /** `program` forces binding through a single-file program instead of `ts.bindSourceFile`. */
  readonly binding?: BindingStrategy;
}

/**
 * Parse and bind one file. Never throws on syntax errors: TypeScript's parser recovers, and errors are
 * reported in `syntaxErrors` (flattened messages, 1-based positions). A file nested beyond the limit for
 * binding is not bound (`bindingFailure` is {@link NESTED_TOO_DEEPLY_TO_BIND}).
 *
 * @throws {Error} with the message {@link NESTED_TOO_DEEPLY_TO_PARSE} for a file nested beyond the limit for
 *   parsing, whether the parser exhausted the stack on it or not, so that the outcome is the same in every
 *   thread.
 */
export function parseTypeScriptFile(
  input: ParseInput,
  options: ParseOptions = {},
): ParsedTypeScriptFile {
  const detected = dialectSuffixOf(input.path);
  const dialect: TypeScriptDialect = isTypeScriptDialect(input.dialect)
    ? input.dialect
    : (detected?.dialect ?? (input.language === "javascript" ? "js" : "ts"));
  const suffix =
    detected !== undefined && detected.dialect === dialect
      ? detected.suffix
      : DEFAULT_SUFFIX[dialect];
  const language = languageOfDialect(dialect);
  let sourceFile: ts.SourceFile;
  try {
    sourceFile = createSourceFile(
      compilerFileName(input.path, suffix),
      input.text,
      {
        languageVersion: ts.ScriptTarget.Latest,
        jsDocParsingMode:
          language === "javascript"
            ? ts.JSDocParsingMode.ParseForTypeInfo
            : ts.JSDocParsingMode.ParseNone,
      },
      true,
      scriptKindOf(dialect),
    );
  } catch (error) {
    resetParserState();
    // Only possible beyond the limit: such files are not analyzed in any thread.
    if (isStackOverflow(error)) throw new Error(NESTED_TOO_DEEPLY_TO_PARSE, { cause: error });
    throw error;
  }
  const nesting = measureNesting(sourceFile, language === "typescript");
  if (nesting.parsing > MAX_PARSING_NESTING) throw new Error(NESTED_TOO_DEEPLY_TO_PARSE);
  const syntaxErrors = parseDiagnosticsOf(sourceFile).map((diagnostic) => {
    const position = positionAt(sourceFile, diagnostic.start);
    return {
      message: flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      line: position.line,
      column: position.column,
    };
  });
  const parsed = { path: input.path, language, dialect, suffix, sourceFile, syntaxErrors };
  if (nesting.binding > MAX_BINDING_NESTING) {
    return { ...parsed, bound: false, bindingFailure: NESTED_TOO_DEEPLY_TO_BIND };
  }
  const binding = bindSourceFile(sourceFile, options.binding ?? "auto");
  return binding.bound
    ? { ...parsed, bound: true }
    : { ...parsed, bound: false, bindingFailure: binding.reason };
}
