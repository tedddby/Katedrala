/**
 * JSON parsing for project configuration with deterministic problem reports.
 *
 * Messages never embed JavaScript engine error text (which differs between Node.js versions); syntax
 * problems are described by the TypeScript JSON parser (pinned with the adapter) and located by line and
 * column in the normalized text.
 */
import ts from "typescript";

/** A parsed JSON object. */
export type JsonObject = Readonly<Record<string, unknown>>;

/** A problem found while parsing a configuration text. */
export interface TextProblem {
  /** One sentence, without the file name. */
  message: string;
  /** 1-based line of the problem, when known. */
  line?: number;
  /** 1-based column (UTF-16 code units) of the problem, when known. */
  column?: number;
}

/** Outcome of {@link parseStrictJson}. */
export type StrictJsonResult = { ok: true; value: unknown } | { ok: false; problem: TextProblem };

/** Outcome of {@link parseConfigJson}: the (possibly partial) object and the first syntax problem. */
export interface ConfigJsonResult {
  value: JsonObject;
  problem?: TextProblem;
}

/** Whether a value is a JSON object (not null, not an array). */
export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 1-based line and column of a 0-based offset in a text. */
export function positionAt(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  const end = Math.min(Math.max(offset, 0), text.length);
  for (let index = 0; index < end; index++) {
    if (text.charCodeAt(index) === 10) {
      line++;
      lineStart = index + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
}

function withoutByteOrderMark(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function problemOf(text: string, diagnostic: ts.Diagnostic): TextProblem {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  if (diagnostic.start === undefined) return { message };
  return { message, ...positionAt(text, diagnostic.start) };
}

/**
 * Parse strict JSON (as Node.js and npm read `package.json`). On failure the problem is located with the
 * TypeScript JSON parser; texts that only use JSONC extensions (comments, trailing commas) are reported
 * as such.
 */
export function parseStrictJson(text: string, fileName: string): StrictJsonResult {
  const source = withoutByteOrderMark(text);
  if (source.trim() === "") return { ok: false, problem: { message: "the file is empty" } };
  try {
    return { ok: true, value: JSON.parse(source) as unknown };
  } catch {
    const { error } = ts.parseConfigFileTextToJson(fileName, source);
    if (error !== undefined) return { ok: false, problem: problemOf(source, error) };
    return {
      ok: false,
      problem: {
        message: "the file is not strict JSON (comments or trailing commas are not allowed)",
      },
    };
  }
}

/**
 * Parse a JSON-with-comments configuration file (`tsconfig.json`) with the TypeScript parser, which
 * accepts comments and trailing commas. Like TypeScript, a syntax error does not discard the parts that
 * could be read.
 */
export function parseConfigJson(text: string, fileName: string): ConfigJsonResult {
  const source = withoutByteOrderMark(text);
  const parsed: { config?: unknown; error?: ts.Diagnostic } = ts.parseConfigFileTextToJson(
    fileName,
    source,
  );
  const { config, error } = parsed;
  const value = isJsonObject(config) ? config : {};
  return error === undefined ? { value } : { value, problem: problemOf(source, error) };
}
