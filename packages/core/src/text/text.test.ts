import { EMPTY_DIGEST, sha256Hex } from "@katedrala/ir";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  BINARY_DETECTION_BYTES,
  contentHash,
  decodeText,
  digestOf,
  isBinaryContent,
  lineCount,
  normalizeLineEndings,
} from "./text.js";

const encoder = new TextEncoder();
const bytes = (text: string): Uint8Array => encoder.encode(text);

describe("decodeText", () => {
  it("decodes UTF-8", () => {
    expect(decodeText(bytes("const café = '☕';\n"))).toEqual({
      text: "const café = '☕';\n",
      binary: false,
    });
  });

  it("removes exactly one leading byte-order mark", () => {
    expect(decodeText(bytes("﻿hello")).text).toBe("hello");
    expect(decodeText(bytes("﻿﻿hello")).text).toBe("﻿hello");
    expect(decodeText(bytes("a﻿b")).text).toBe("a﻿b");
  });

  it.each([
    ["a\r\nb\r\n", "a\nb\n"],
    ["a\rb\r", "a\nb\n"],
    ["a\r\r\nb", "a\n\nb"],
    ["a\n\rb", "a\n\nb"],
    ["\r\n", "\n"],
    ["no line ending", "no line ending"],
  ])("normalizes line endings of %j", (input, expected) => {
    expect(decodeText(bytes(input)).text).toBe(expected);
  });

  it("replaces invalid UTF-8 sequences instead of failing", () => {
    expect(decodeText(Uint8Array.from([0x61, 0xff, 0x62])).text).toBe("a�b");
    expect(decodeText(Uint8Array.from([0xe2, 0x82])).text).toBe("�");
  });

  it("treats a NUL byte among the first 8000 bytes as binary", () => {
    expect(decodeText(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]))).toEqual({
      text: "",
      binary: true,
    });
    const lateNul = new Uint8Array(BINARY_DETECTION_BYTES + 10).fill(0x61);
    lateNul[BINARY_DETECTION_BYTES - 1] = 0;
    expect(isBinaryContent(lateNul)).toBe(true);
    lateNul[BINARY_DETECTION_BYTES - 1] = 0x61;
    lateNul[BINARY_DETECTION_BYTES] = 0;
    expect(isBinaryContent(lateNul)).toBe(false);
    expect(decodeText(lateNul).binary).toBe(false);
  });

  it("decodes empty content as empty text", () => {
    expect(decodeText(new Uint8Array())).toEqual({ text: "", binary: false });
  });

  it("round-trips valid text up to one BOM and line endings", () => {
    const unit = fc.oneof(
      fc.constantFrom("﻿", "\r", "\n", "\r\n", "\u0000"),
      fc.string({ unit: "grapheme", minLength: 1, maxLength: 1 }),
    );
    fc.assert(
      fc.property(
        fc.array(unit, { maxLength: 30 }).map((parts) => parts.join("")),
        (text) => {
          const decoded = decodeText(bytes(text));
          expect(decoded.binary).toBe(text.includes("\u0000"));
          if (decoded.binary) return;
          const withoutBom = text.startsWith("﻿") ? text.slice(1) : text;
          expect(decoded.text).toBe(withoutBom.replace(/\r\n|\r/g, "\n"));
          expect(decoded.text.includes("\r")).toBe(false);
        },
      ),
    );
  });
});

describe("normalizeLineEndings", () => {
  it("is idempotent and removes every CR", () => {
    const text = fc.string({ unit: fc.constantFrom("a", "\r", "\n", "\r\n", "é") });
    fc.assert(
      fc.property(text, (value) => {
        const once = normalizeLineEndings(value);
        expect(once.includes("\r")).toBe(false);
        expect(normalizeLineEndings(once)).toBe(once);
        // Every line ending (CRLF, CR, LF) becomes exactly one LF.
        expect(once.split("\n").length).toBe(value.split(/\r\n|\r|\n/).length);
      }),
    );
  });
});

describe("lineCount", () => {
  it.each([
    ["", 0],
    ["a", 1],
    ["a\n", 1],
    ["a\nb", 2],
    ["a\nb\n", 2],
    ["\n", 1],
    ["\n\n", 2],
    ["a\n\nb\n", 3],
  ])("counts %j as %i lines", (text, expected) => {
    expect(lineCount(text)).toBe(expected);
  });

  it("matches the IR definition", () => {
    fc.assert(
      fc.property(fc.string({ unit: fc.constantFrom("a", "\n", "b") }), (text) => {
        const newlines = text.split("\n").length - 1;
        const expected = newlines + (text !== "" && !text.endsWith("\n") ? 1 : 0);
        expect(lineCount(text)).toBe(expected);
      }),
    );
  });
});

describe("contentHash", () => {
  it("is the self-describing SHA-256 of the UTF-8 text", () => {
    expect(contentHash("")).toBe(EMPTY_DIGEST);
    expect(contentHash("abc")).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(contentHash("x")).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("agrees with the IR's reference SHA-256 for any string", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        expect(contentHash(text)).toBe(`sha256:${sha256Hex(text)}`);
      }),
    );
  });

  it("does not depend on line endings or a byte-order mark once decoded", () => {
    const lf = decodeText(bytes("export const a = 1;\nexport const b = 2;\n")).text;
    const crlf = decodeText(bytes("﻿export const a = 1;\r\nexport const b = 2;\r\n")).text;
    const cr = decodeText(bytes("export const a = 1;\rexport const b = 2;\r")).text;
    expect(contentHash(crlf)).toBe(contentHash(lf));
    expect(contentHash(cr)).toBe(contentHash(lf));
    expect(contentHash(lf)).not.toBe(contentHash(`${lf} `));
  });
});

describe("digestOf", () => {
  it("hashes the parts joined by newlines", () => {
    expect(digestOf([])).toBe(EMPTY_DIGEST);
    expect(digestOf(["a", "b"])).toBe(contentHash("a\nb"));
    expect(digestOf(["a", "b"])).not.toBe(digestOf(["ab"]));
    expect(digestOf(["a", ""])).not.toBe(digestOf(["a"]));
  });

  it("equals the content hash of the joined parts", () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: "binary" }), { maxLength: 8 }), (parts) => {
        expect(digestOf(parts)).toBe(contentHash(parts.join("\n")));
      }),
    );
  });
});
