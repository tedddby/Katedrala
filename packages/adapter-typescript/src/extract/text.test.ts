import fc from "fast-check";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import {
  MAX_TEXT_LENGTH,
  collapseWhitespace,
  normalizeLineEndings,
  positionAt,
  singleLine,
  truncate,
  truncateWithEllipsis,
} from "./text.js";

describe("truncate", () => {
  it("keeps short strings and cuts long ones", () => {
    expect(truncate("abc", 5)).toBe("abc");
    expect(truncate("abcdef", 3)).toBe("abc");
    expect(truncate("x".repeat(300))).toHaveLength(MAX_TEXT_LENGTH);
  });

  it("never splits a surrogate pair", () => {
    expect(truncate("ab😀cd", 3)).toBe("ab");
  });

  it("returns a prefix of at most max code units without a dangling high surrogate (property)", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary", maxLength: 50 }),
        fc.integer({ min: 1, max: 40 }),
        (text, max) => {
          const result = truncate(text, max);
          expect(result.length).toBeLessThanOrEqual(max);
          expect(text.startsWith(result)).toBe(true);
          const last = result.charCodeAt(result.length - 1);
          if (result.length < text.length) expect(last >= 0xd800 && last <= 0xdbff).toBe(false);
        },
      ),
    );
  });

  it("marks cuts with an ellipsis", () => {
    expect(truncateWithEllipsis("abcdef", 4)).toBe("abc…");
    expect(truncateWithEllipsis("abc", 4)).toBe("abc");
  });
});

describe("single-line text", () => {
  it("collapses whitespace and removes comments", () => {
    expect(collapseWhitespace("  a \n\t b  ")).toBe("a b");
    expect(singleLine("f(\n  a, // first\n  /* second */ b,\n)")).toBe("f( a, b, )");
    expect(singleLine('x = "// not a comment"')).toBe('x = "// not a comment"');
  });

  it("produces one line without doubled spaces (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (text) => {
        const result = singleLine(text);
        expect(result).not.toMatch(/\n|\r| {2}/);
        expect(result).toBe(result.trim());
        expect(singleLine(result)).toBe(result);
      }),
    );
  });

  it("normalizes line endings", () => {
    expect(normalizeLineEndings("a\r\nb\rc\n")).toBe("a\nb\nc\n");
  });
});

describe("positions", () => {
  const sourceFile = (text: string): ts.SourceFile =>
    ts.createSourceFile("a.ts", text, ts.ScriptTarget.Latest);

  it("delimits lines by \n only, as the IR does (not at U+2028 and U+2029)", () => {
    const file = sourceFile("a\u2028b\u2029c\nd");
    expect(positionAt(file, 0)).toEqual({ line: 1, column: 1 });
    expect(positionAt(file, 4)).toEqual({ line: 1, column: 5 });
    expect(positionAt(file, 5)).toEqual({ line: 1, column: 6 });
    expect(positionAt(file, 6)).toEqual({ line: 2, column: 1 });
    expect(positionAt(file, 7)).toEqual({ line: 2, column: 2 });
  });

  it("agrees with splitting the text at \n (property)", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("a", "\n", "\u2028", "\u2029", "\r", "😀", " "), {
          maxLength: 60,
        }),
        fc.nat(),
        (parts, seed) => {
          const text = parts.join("");
          const offset = text.length === 0 ? 0 : seed % (text.length + 1);
          const before = text.slice(0, offset).split("\n");
          expect(positionAt(sourceFile(text), offset)).toEqual({
            line: before.length,
            column: (before.at(-1) ?? "").length + 1,
          });
        },
      ),
    );
  });
});
