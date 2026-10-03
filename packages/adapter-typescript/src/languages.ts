/**
 * Languages and dialects handled by the TypeScript/JavaScript adapter, and file detection.
 */
import type { LanguageDetection, LanguageInfo } from "@katedrala/plugin-api";

/** Language identifiers reported by the adapter. */
export type TypeScriptLanguageId = "typescript" | "javascript";

/**
 * Dialects (part of the extraction cache key):
 * - `ts`, `tsx`, `mts`, `cts`: TypeScript sources (`.ts`, `.tsx`, `.mts`, `.cts`).
 * - `dts`: declaration files (`.d.ts`, `.d.mts`, `.d.cts`, and arbitrary-extension declarations such as
 *   `.d.css.ts`).
 * - `js`, `jsx`, `mjs`, `cjs`: JavaScript sources (`.js`, `.jsx`, `.mjs`, `.cjs`).
 */
export type TypeScriptDialect = "ts" | "tsx" | "mts" | "cts" | "dts" | "js" | "jsx" | "mjs" | "cjs";

/** The result of {@link detectTypeScriptLanguage}. */
export interface TypeScriptLanguageDetection extends LanguageDetection {
  language: TypeScriptLanguageId;
  dialect: TypeScriptDialect;
}

/** The languages of the adapter with their (lower-case) file extensions. */
export const TYPESCRIPT_LANGUAGES: readonly LanguageInfo[] = Object.freeze([
  Object.freeze({
    id: "typescript",
    displayName: "TypeScript",
    extensions: Object.freeze([".ts", ".tsx", ".mts", ".cts"]),
  }),
  Object.freeze({
    id: "javascript",
    displayName: "JavaScript",
    extensions: Object.freeze([".js", ".jsx", ".mjs", ".cjs"]),
  }),
]);

const DIALECT_LANGUAGE: Readonly<Record<TypeScriptDialect, TypeScriptLanguageId>> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  dts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
};

/** Extensions in matching order (longest first where one is a suffix of another). */
const EXTENSIONS: ReadonlyArray<readonly [string, TypeScriptDialect]> = [
  [".d.mts", "dts"],
  [".d.cts", "dts"],
  [".d.ts", "dts"],
  [".tsx", "tsx"],
  [".mts", "mts"],
  [".cts", "cts"],
  [".ts", "ts"],
  [".jsx", "jsx"],
  [".mjs", "mjs"],
  [".cjs", "cjs"],
  [".js", "js"],
];

/** Whether a value is one of the adapter's dialects. */
export function isTypeScriptDialect(value: unknown): value is TypeScriptDialect {
  return typeof value === "string" && Object.hasOwn(DIALECT_LANGUAGE, value);
}

/** The language of a dialect. */
export function languageOfDialect(dialect: TypeScriptDialect): TypeScriptLanguageId {
  return DIALECT_LANGUAGE[dialect];
}

/**
 * The file-name suffix that determines a path's dialect (lower-cased, e.g. `.d.ts`, `.tsx`), or undefined
 * when the adapter does not handle the path. Matching is case-insensitive; the stem must not be empty.
 */
export function dialectSuffixOf(
  path: string,
): { suffix: string; dialect: TypeScriptDialect } | undefined {
  const slash = path.lastIndexOf("/");
  const name = (slash === -1 ? path : path.slice(slash + 1)).toLowerCase();
  for (const [extension, dialect] of EXTENSIONS) {
    if (name.length > extension.length && name.endsWith(extension)) {
      if (dialect === "ts") {
        // Like TypeScript: a `.ts` file whose name contains `.d.` declares an arbitrary extension
        // (`styles.d.css.ts`).
        const declaration = name.lastIndexOf(".d.");
        if (declaration > 0) return { suffix: name.slice(declaration), dialect: "dts" };
      }
      return { suffix: extension, dialect };
    }
  }
  return undefined;
}

/**
 * Claim TypeScript and JavaScript files by extension (case-insensitive): `.ts`, `.tsx`, `.mts`, `.cts` and
 * declaration files (`.d.ts`, `.d.mts`, `.d.cts`) are `typescript`; `.js`, `.jsx`, `.mjs`, `.cjs` are
 * `javascript`. Anything else yields undefined.
 */
export function detectTypeScriptLanguage(path: string): TypeScriptLanguageDetection | undefined {
  const match = dialectSuffixOf(path);
  if (match === undefined) return undefined;
  return { language: DIALECT_LANGUAGE[match.dialect], dialect: match.dialect };
}
