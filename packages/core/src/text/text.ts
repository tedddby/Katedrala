/**
 * Text normalization and digests, implementing the IR conventions (docs/IR.md, "Conventions"): content is
 * decoded as UTF-8, a byte-order mark is removed and line endings (CRLF, lone CR) become LF before analysis;
 * positions, line counts and digests refer to the normalized text.
 */
import { createHash } from "node:crypto";

/** Number of leading bytes inspected for a NUL byte when deciding whether content is binary (as git does). */
export const BINARY_DETECTION_BYTES = 8000;

/** The result of {@link decodeText}. */
export interface DecodedText {
  /** Normalized text (UTF-8 decoded, BOM removed, LF line endings); empty for binary content. */
  text: string;
  /** Whether the content is binary (a NUL byte occurs among the first {@link BINARY_DETECTION_BYTES} bytes). */
  binary: boolean;
}

// Non-fatal: invalid UTF-8 sequences decode to U+FFFD instead of throwing. `ignoreBOM` keeps a leading BOM in
// the output so that its removal below is explicit (exactly one leading BOM is removed).
const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });

const BYTE_ORDER_MARK = 0xfeff;

/** Whether raw content is binary: a NUL byte occurs among its first {@link BINARY_DETECTION_BYTES} bytes. */
export function isBinaryContent(bytes: Uint8Array): boolean {
  return bytes.subarray(0, BINARY_DETECTION_BYTES).includes(0);
}

/** Convert CRLF and lone CR line endings to LF. */
export function normalizeLineEndings(text: string): string {
  return text.includes("\r") ? text.replace(/\r\n?/g, "\n") : text;
}

/**
 * Decode stored bytes into normalized text: binary content (see {@link isBinaryContent}) yields
 * `{ text: "", binary: true }`; otherwise the bytes are decoded as UTF-8 (invalid sequences become U+FFFD),
 * one leading byte-order mark is removed and line endings are normalized to LF.
 */
export function decodeText(bytes: Uint8Array): DecodedText {
  if (isBinaryContent(bytes)) return { text: "", binary: true };
  let text = decoder.decode(bytes);
  if (text.charCodeAt(0) === BYTE_ORDER_MARK) text = text.slice(1);
  return { text: normalizeLineEndings(text), binary: false };
}

/**
 * Line count of a normalized text: the number of `\n` characters, plus one if the text is non-empty and does
 * not end with `\n` (docs/IR.md). `""` has 0 lines, `"a"` and `"a\n"` have 1, `"a\nb"` has 2.
 */
export function lineCount(text: string): number {
  if (text === "") return 0;
  let count = 0;
  let index = text.indexOf("\n");
  while (index !== -1) {
    count++;
    index = text.indexOf("\n", index + 1);
  }
  return text.endsWith("\n") ? count : count + 1;
}

/**
 * `sha256:<64 hex digits>` of a text encoded as UTF-8: the `FileEntity.hash` of normalized file content.
 * Pass normalized text (see {@link decodeText}) so that line-ending differences do not change the digest.
 */
export function contentHash(text: string): string {
  return `sha256:${createHash("sha256").update(text, "utf8").digest("hex")}`;
}

/**
 * `sha256:<64 hex digits>` over `parts` joined by `"\n"` (encoded as UTF-8), without materializing the
 * joined string. `digestOf([])` is the digest of the empty string (`EMPTY_DIGEST` in `@katedrala/ir`).
 */
export function digestOf(parts: readonly string[]): string {
  const hash = createHash("sha256");
  parts.forEach((part, index) => {
    if (index > 0) hash.update("\n", "utf8");
    hash.update(part, "utf8");
  });
  return `sha256:${hash.digest("hex")}`;
}
