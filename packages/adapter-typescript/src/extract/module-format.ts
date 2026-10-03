/**
 * Module format and global declarations of a file.
 *
 * - `esm`: the file uses ES module syntax (`import`/`export` declarations, including `export {}` and type-only
 *   forms, exported declarations, `export default`, `import.meta`).
 * - `commonjs`: otherwise, when it uses the CommonJS globals (`require()`, `module.exports`, `exports.x`) or
 *   TypeScript's CommonJS syntax (`import x = require()`, `export =`).
 * - `script`: neither; top-level declarations are globals (also for declaration files).
 *
 * Node.js decides the format of `.mjs`/`.mts` (always ES modules) and `.cjs`/`.cts` (always CommonJS)
 * files by extension; their declaration files likewise.
 */
import type { FileExtraction } from "@katedrala/plugin-api";
import ts from "typescript";
import type { FileDeclarations } from "./declarations.js";
import { hasModifier } from "./syntax.js";
import type { ModuleUsage } from "./walker.js";
import { K } from "./kinds.js";

const {
  isExportAssignment,
  isExportDeclaration,
  isExternalModuleReference,
  isImportDeclaration,
  isImportEqualsDeclaration,
} = ts;

/** Whether a top-level statement is ES module syntax. */
function isEsModuleStatement(statement: ts.Statement): boolean {
  if (isImportDeclaration(statement) || isExportDeclaration(statement)) return true;
  if (isExportAssignment(statement)) return statement.isExportEquals !== true;
  if (isImportEqualsDeclaration(statement)) return false;
  return hasModifier(statement, K.ExportKeyword);
}

/** Whether a top-level statement is TypeScript's CommonJS syntax (`import x = require()`, `export =`). */
function isCommonJsStatement(statement: ts.Statement): boolean {
  if (isExportAssignment(statement)) return statement.isExportEquals === true;
  return (
    isImportEqualsDeclaration(statement) && isExternalModuleReference(statement.moduleReference)
  );
}

/** The module format of a file; `suffix` is its lower-cased dialect suffix (e.g. `.mts`, `.d.cts`). */
export function moduleFormatOf(
  file: ts.SourceFile,
  suffix: string,
  usage: ModuleUsage,
): FileExtraction["moduleFormat"] {
  if (suffix.endsWith(".mjs") || suffix.endsWith(".mts")) return "esm";
  if (suffix.endsWith(".cjs") || suffix.endsWith(".cts")) return "commonjs";
  if (usage.importMeta || file.statements.some(isEsModuleStatement)) return "esm";
  if (usage.commonJs || file.statements.some(isCommonJsStatement)) return "commonjs";
  return "script";
}

/**
 * Local names of global declarations: the top-level declarations of scripts (except ambient module
 * declarations, which declare modules rather than names) and the declarations directly inside
 * `declare global { }`.
 */
export function globalsOf(
  declarations: FileDeclarations,
  moduleFormat: FileExtraction["moduleFormat"],
): string[] {
  return declarations.symbols
    .filter(
      (symbol) =>
        symbol.parent === undefined &&
        (symbol.global || (moduleFormat === "script" && symbol.kind !== "module")),
    )
    .map((symbol) => symbol.localName);
}
