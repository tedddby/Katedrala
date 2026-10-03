/**
 * Positions, ranges and bounded text.
 *
 * Positions are 1-based lines and columns in UTF-16 code units of the (already normalized) file text. Lines
 * are delimited by `\n` only, as the IR defines them: TypeScript's own line map also breaks lines at U+2028
 * and U+2029, which would shift every later position. Range ends are exclusive.
 */
import type { Position, Range } from "@katedrala/ir";
import ts from "typescript";
import { K } from "./kinds.js";

const { createScanner } = ts;

/** Offsets at which the lines of a file start, computed once per file. */
const LINE_STARTS = new WeakMap<ts.SourceFile, readonly number[]>();

function lineStartsOf(file: ts.SourceFile): readonly number[] {
  const cached = LINE_STARTS.get(file);
  if (cached !== undefined) return cached;
  const text = file.text;
  const starts = [0];
  for (let index = text.indexOf("\n"); index !== -1; index = text.indexOf("\n", index + 1)) {
    starts.push(index + 1);
  }
  LINE_STARTS.set(file, starts);
  return starts;
}

/** Comments and whitespace, replaced by a space in {@link singleLine}. */
const TRIVIA = new Set<ts.SyntaxKind>([
  K.SingleLineCommentTrivia,
  K.MultiLineCommentTrivia,
  K.WhitespaceTrivia,
  K.NewLineTrivia,
  K.ShebangTrivia,
  K.ConflictMarkerTrivia,
]);

/** Maximum length of strings in extractions (signatures, argument texts, string values, attributes). */
export const MAX_TEXT_LENGTH = 200;

/** The 1-based position of a character offset (lines delimited by `\n` only). */
export function positionAt(file: ts.SourceFile, offset: number): Position {
  const starts = lineStartsOf(file);
  // The last line starting at or before the offset.
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >>> 1;
    if ((starts[middle] ?? 0) <= offset) low = middle;
    else high = middle - 1;
  }
  return { line: low + 1, column: offset - (starts[low] ?? 0) + 1 };
}

/** The 1-based position of a node's first token (excluding leading trivia and JSDoc). */
export function startOf(file: ts.SourceFile, node: ts.Node): Position {
  return positionAt(file, node.getStart(file));
}

/** The range of a node from its first token (decorators and modifiers included) to its end. */
export function rangeOf(file: ts.SourceFile, node: ts.Node): Range {
  return { start: positionAt(file, node.getStart(file)), end: positionAt(file, node.end) };
}

/** Cut a string to at most `max` UTF-16 code units without splitting a surrogate pair. */
export function truncate(text: string, max: number = MAX_TEXT_LENGTH): string {
  if (text.length <= max) return text;
  let end = max;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return text.slice(0, end);
}

/** Cut a string to at most `max` code units, marking the cut with an ellipsis. */
export function truncateWithEllipsis(text: string, max: number = MAX_TEXT_LENGTH): string {
  return text.length <= max ? text : `${truncate(text, max - 1)}…`;
}

/** Convert CRLF and CR line endings to LF. */
export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Collapse runs of whitespace into single spaces and trim. */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Source text on a single line: comments removed and whitespace collapsed. Comments are found with
 * TypeScript's scanner only when the text may contain one.
 */
export function singleLine(text: string): string {
  if (!text.includes("//") && !text.includes("/*")) return collapseWhitespace(text);
  const scanner = createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  let result = "";
  for (let kind = scanner.scan(); kind !== K.EndOfFileToken; kind = scanner.scan()) {
    result += TRIVIA.has(kind) ? " " : scanner.getTokenText();
  }
  return collapseWhitespace(result);
}

/** The source text between two offsets of a file on a single line (see {@link singleLine}). */
export function sliceSingleLine(file: ts.SourceFile, start: number, end: number): string {
  return singleLine(file.text.slice(start, Math.max(start, end)));
}
